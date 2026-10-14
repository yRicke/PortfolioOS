"""Configuração exclusiva da verificação de navegador, com dados descartáveis."""
import os
from pathlib import Path

from setup.settings import *  # noqa: F403

QA_ROOT = Path(os.environ['HENRI_OS_QA_ROOT']).resolve()
DATABASE_URL = None
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': QA_ROOT / 'db.sqlite3'}}
MEDIA_ROOT = QA_ROOT / 'media'
STORAGES = {
    'default': {'BACKEND': 'django.core.files.storage.FileSystemStorage'},
    'staticfiles': {'BACKEND': 'django.contrib.staticfiles.storage.StaticFilesStorage'},
}
DEBUG = True
SECURE_SSL_REDIRECT = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
