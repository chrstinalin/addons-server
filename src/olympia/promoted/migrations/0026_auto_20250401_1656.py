# Generated by Django 4.2.20 on 2025-04-01 16:56

from django.db import migrations, models

from olympia.constants.promoted import PROMOTED_GROUP_CHOICES, PROMOTED_GROUPS_BY_ID

def create_partner_promoted_group(apps, schema_editor):
    PromotedGroup = apps.get_model('promoted', 'PromotedGroup')
    partner = PROMOTED_GROUPS_BY_ID[PROMOTED_GROUP_CHOICES.PARTNER]
    PromotedGroup.objects.update_or_create(
        group_id=partner.id,
        defaults={
            'name': partner.name,
            'api_name': partner.api_name,
            'high_profile': True,
            'active': True,
            'is_public': False
        }
    )

def reverse_partner_promoted_group(apps, schema_editor):
    PromotedGroup = apps.get_model('promoted', 'PromotedGroup')
    PromotedGroup.objects.filter(group_id=PROMOTED_GROUP_CHOICES.PARTNER).delete()

class Migration(migrations.Migration):

    dependencies = [
        ('promoted', '0024_alter_promotedaddon_group_id_and_more'),
    ]

    operations = [
    migrations.AddField(
        model_name='promotedgroup',
        name='is_public',
        field=models.BooleanField(
        default=True,
        help_text=(
            'Marks whether this promotion group is public (accessible via the API).'
        ),
    )
    ),
    migrations.RunPython(create_partner_promoted_group, reverse_partner_promoted_group)
    ]
