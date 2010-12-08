import os
import re

from django import forms
from django.conf import settings

import happyforms
from tower import ugettext as _, ungettext as ngettext

import amo
import captcha.fields
from amo.utils import slug_validator
from addons.models import Addon, ReverseNameLookup
from addons.widgets import IconWidgetRenderer
from tags.models import Tag
from translations.fields import TransField, TransTextarea
from translations.forms import TranslationFormMixin
from translations.models import Translation
from translations.widgets import TranslationTextInput
from versions.compare import version_int


def clean_name(name, instance=None):
    id = ReverseNameLookup.get(name)

    # If we get an id and either there's no instance or the instance.id != id.
    if id and (not instance or id != instance.id):
        raise forms.ValidationError(_('This add-on name is already in use.  '
                                      'Please choose another.'))
    return name


class AddonFormBase(TranslationFormMixin, happyforms.ModelForm):

    def __init__(self, *args, **kw):
        self.request = kw.pop('request')
        super(AddonFormBase, self).__init__(*args, **kw)


class AddonFormBasic(AddonFormBase):
    name = TransField(max_length=50)
    slug = forms.CharField(max_length=30)
    summary = TransField(widget=TransTextarea, max_length=250)
    tags = forms.CharField(required=False)

    def __init__(self, *args, **kw):
        super(AddonFormBasic, self).__init__(*args, **kw)
        self.fields['tags'].initial = ', '.join(tag.tag_text for tag in
                                                self.instance.tags.all())
        # Do not simply append validators, as validators will persist between
        # instances.
        validate_name = lambda x: clean_name(x, self.instance)
        name_validators = list(self.fields['name'].validators)
        name_validators.append(validate_name)
        self.fields['name'].validators = name_validators

    def save(self, addon, commit=False):
        tags_new = self.cleaned_data['tags']
        tags_old = [t.tag_text for t in addon.tags.all()]

        # Add new tags.
        for t in set(tags_new) - set(tags_old):
            Tag(tag_text=t).save_tag(addon, self.request.amo_user)

        # Remove old tags.
        for t in set(tags_old) - set(tags_new):
            Tag(tag_text=t).remove_tag(addon, self.request.amo_user)

        return super(AddonFormBasic, self).save()

    def clean_tags(self):
        target = [t.strip() for t in self.cleaned_data['tags'].split(',')
                  if t.strip()]

        max_tags = amo.MAX_TAGS
        min_len = amo.MIN_TAG_LENGTH
        total = len(target)
        tags_short = [t for t in target if len(t.strip()) < min_len]

        if total > max_tags:
            raise forms.ValidationError(ngettext(
                                        'You have {0} too many tags.',
                                        'You have {0} too many tags.',
                                        total - max_tags)
                                        .format(total - max_tags))

        if tags_short:
            raise forms.ValidationError(ngettext(
                        'All tags must be at least {0} character.',
                        'All tags must be at least {0} characters.',
                        min_len).format(min_len))
        return target

    def clean_slug(self):
        target = self.cleaned_data['slug']
        slug_validator(target, lower=False)

        if self.cleaned_data['slug'] != self.instance.slug:
            if Addon.objects.filter(slug=target).exists():
                raise forms.ValidationError(_('This slug is already in use.'))
        return target


def icons():
    """
    Generates a list of tuples for the default icons for add-ons,
    in the format (psuedo-mime-type, description).
    """
    icons = [('image/jpeg', 'jpeg'), ('image/png', 'png'), ('', 'default')]
    dir_list = os.listdir(settings.ADDON_ICONS_DEFAULT_PATH)
    for fn in dir_list:
        if ('%s' % 32) in fn and not "default" in fn:
            icon_name = fn.split('-')[0]
            icons.append(('icon/%s' % icon_name, icon_name))
    return icons


class AddonFormMedia(AddonFormBase):
    icon_upload = forms.FileField(required=False)
    icon_type = forms.CharField(widget=forms.RadioSelect(
            renderer=IconWidgetRenderer, choices=icons()), required=False)

    class Meta:
        model = Addon
        fields = ('icon_upload', 'icon_type')


class AddonFormDetails(AddonFormBase):
    default_locale = forms.TypedChoiceField(choices=Addon.LOCALES)

    class Meta:
        model = Addon
        fields = ('description', 'default_locale', 'homepage')

    def clean(self):
        # Make sure we have the required translations in the new locale.
        required = 'name', 'summary', 'description'
        data = self.cleaned_data
        if not self.errors and 'default_locale' in self.changed_data:
            fields = dict((k, getattr(self.instance, k + '_id'))
                          for k in required)
            locale = self.cleaned_data['default_locale']
            ids = filter(None, fields.values())
            qs = (Translation.objects.filter(locale=locale, id__in=ids,
                                             localized_string__isnull=False)
                  .values_list('id', flat=True))
            missing = [k for k, v in fields.items() if v not in qs]
            # They might be setting description right now.
            if 'description' in missing and locale in data['description']:
                missing.remove('description')
            if missing:
                raise forms.ValidationError(
                    _('Before changing you default locale you must have a '
                      'name, summary, and description in that locale. '
                      'You are missing %s.') % ', '.join(map(repr, missing)))
        return data


class AddonFormSupport(AddonFormBase):
    support_url = TransField.adapt(forms.URLField)(required=False)
    support_email = TransField.adapt(forms.EmailField)(required=False)

    class Meta:
        model = Addon
        fields = ('support_email', 'support_url')

    def save(self, addon, commit=True):
        instance = self.instance

        # If there's a GetSatisfaction URL entered, we'll extract the product
        # and company name and save it to the DB.
        gs_regex = "getsatisfaction\.com/(\w*)(?:/products/(\w*))?"
        match = re.search(gs_regex, instance.support_url.localized_string)

        company = product = None

        if match:
            company, product = match.groups()

        instance.get_satisfaction_company = company
        instance.get_satisfaction_product = product

        return super(AddonFormSupport, self).save(commit)


class AddonFormTechnical(AddonFormBase):
    developer_comments = TransField(widget=TransTextarea)

    class Meta:
        model = Addon
        fields = ('developer_comments', 'view_source', 'site_specific',
                  'external_software', 'binary')


class AddonForm(happyforms.ModelForm):
    name = forms.CharField(widget=TranslationTextInput,)
    homepage = forms.CharField(widget=TranslationTextInput, required=False)
    eula = forms.CharField(widget=TranslationTextInput,)
    description = forms.CharField(widget=TranslationTextInput,)
    developer_comments = forms.CharField(widget=TranslationTextInput,)
    privacy_policy = forms.CharField(widget=TranslationTextInput,)
    the_future = forms.CharField(widget=TranslationTextInput,)
    the_reason = forms.CharField(widget=TranslationTextInput,)
    support_email = forms.CharField(widget=TranslationTextInput,)

    class Meta:
        model = Addon
        fields = ('name', 'homepage', 'default_locale', 'support_email',
                  'support_url', 'description', 'summary',
                  'developer_comments', 'eula', 'privacy_policy', 'the_reason',
                  'the_future', 'view_source', 'prerelease', 'binary',
                  'site_specific', 'get_satisfaction_company',
                  'get_satisfaction_product',)

        exclude = ('status', )

    def clean_name(self):
        name = self.cleaned_data['name']
        return clean_name(name)

    def save(self):
        desc = self.data.get('description')
        if desc and desc != unicode(self.instance.description):
            amo.log(amo.LOG.EDIT_DESCRIPTIONS, self.instance)
        if self.changed_data:
            amo.log(amo.LOG.EDIT_PROPERTIES, self.instance)

        super(AddonForm, self).save()


class AbuseForm(happyforms.Form):
    recaptcha = captcha.fields.ReCaptchaField(label='')
    text = forms.CharField(required=True,
                           label='',
                           widget=forms.Textarea())

    def __init__(self, *args, **kwargs):
        self.request = kwargs.pop('request')
        super(AbuseForm, self).__init__(*args, **kwargs)

        if (not self.request.user.is_anonymous() or
            not settings.RECAPTCHA_PRIVATE_KEY):
            del self.fields['recaptcha']


class UpdateForm(happyforms.Form):
    reqVersion = forms.CharField(required=True)
    # Order is important, version validation requires an id.
    id = forms.CharField(required=True)
    version = forms.CharField(required=True)
    appID = forms.CharField(required=True)
    # Order is important, appVersion validation requires an appID.
    appVersion = forms.CharField(required=True)
    appOS = forms.CharField(required=False)

    @property
    def is_beta_version(self):
        return amo.VERSION_BETA.search(self.cleaned_data.get('version', ''))

    def clean_id(self):
        try:
            addon = Addon.objects.get(guid=self.cleaned_data['id'])
        except Addon.DoesNotExist:
            raise forms.ValidationError(_('Id is required.'))
        return addon

    def clean_appOS(self):
        data = self.cleaned_data['appOS']
        for platform in [amo.PLATFORM_LINUX, amo.PLATFORM_BSD,
                         amo.PLATFORM_MAC, amo.PLATFORM_WIN,
                         amo.PLATFORM_SUN]:
            if platform.shortname in data:
                return platform

    @property
    def version_int(self):
        return version_int(self.cleaned_data['appVersion'])

    def clean_appID(self):
        try:
            return amo.APP_GUIDS[self.cleaned_data['appID']]
        except KeyError:
            raise forms.ValidationError(_('Unknown application guid.'))
