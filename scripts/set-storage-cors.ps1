# ضبط CORS لـ Firebase Storage — مطلوب لرفع الملفات من المتصفح/التطبيق
# يتطلب Google Cloud SDK (gsutil) مثبتاً ومسجلاً: gcloud auth login
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

$bucket = "gs://students-portal-34231.firebasestorage.app"
Write-Host ">> Setting CORS on $bucket" -ForegroundColor Cyan
gsutil cors set storage-cors.json $bucket
Write-Host ">> Done. Verify with: gsutil cors get $bucket" -ForegroundColor Green
