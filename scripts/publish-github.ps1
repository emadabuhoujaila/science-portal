# نشر ملفات الويب إلى GitHub Pages
# www/js/app.js = المصدر الرئيسي للكود — يُدمَج في js/ دون حذف firebase-init.js
param(
  [Parameter(Mandatory = $false)]
  [string]$Message = "Update web files"
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$GitArgs)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  & git @GitArgs 2>&1 | ForEach-Object {
    if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() }
    else { $_ }
  } | Write-Host
  $code = $LASTEXITCODE
  $ErrorActionPreference = $prev
  if ($code -ne 0) {
    throw "git $($GitArgs -join ' ') failed (exit $code)"
  }
}

function Copy-FileIfExists($src, $dest) {
  if (-not (Test-Path $src)) { return $false }
  $destDir = Split-Path $dest -Parent
  if ($destDir -and -not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Copy-Item $src $dest -Force
  return $true
}

function Merge-DirFiles($srcDir, $destDir) {
  if (-not (Test-Path $srcDir)) { return }
  if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
  }
  Get-ChildItem $srcDir -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring((Resolve-Path $srcDir).Path.Length).TrimStart('\')
    Copy-FileIfExists $_.FullName (Join-Path $destDir $rel) | Out-Null
  }
}

function Mirror-Dir($srcDir, $destDir) {
  if (-not (Test-Path $srcDir)) { return }
  if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force }
  Copy-Item $srcDir $destDir -Recurse -Force
}

# Sync www -> root: merge files only (never delete root-only files like firebase-init.js)
# index.html: root is source of truth (UI edits live at repo root for GitHub Pages)
$rootFirst = @("manifest.json", "sw.js", "icon-192.png", "icon-512.png")
foreach ($item in $rootFirst) {
  Copy-FileIfExists (Join-Path "www" $item) (Join-Path $root $item) | Out-Null
}
Merge-DirFiles (Join-Path "www" "js") (Join-Path $root "js")
Merge-DirFiles (Join-Path "www" "css") (Join-Path $root "css")
Merge-DirFiles (Join-Path "www" "img") (Join-Path $root "img")

Write-Host ">> Sync repo root -> www/ (mirror for git)" -ForegroundColor Cyan
$rootToWww = @("index.html") + $rootFirst
foreach ($item in $rootToWww) {
  Copy-FileIfExists (Join-Path $root $item) (Join-Path "www" $item) | Out-Null
}
Mirror-Dir (Join-Path $root "js") (Join-Path "www" "js")
Mirror-Dir (Join-Path $root "css") (Join-Path "www" "css")
Mirror-Dir (Join-Path $root "img") (Join-Path "www" "img")

Write-Host ">> git add / commit / pull / push" -ForegroundColor Cyan
$webPaths = @(
  "index.html", "manifest.json", "sw.js", "css", "js", "img", "icon-192.png", "icon-512.png",
  "www/index.html", "www/manifest.json", "www/sw.js", "www/css", "www/js", "www/img",
  "www/icon-192.png", "www/icon-512.png"
)
$existing = @($webPaths | Where-Object { Test-Path $_ })
if (-not $existing.Count) {
  Write-Host "No web files found to publish." -ForegroundColor Yellow
  exit 0
}
Invoke-Git add @existing

$prev = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$staged = (& git diff --cached --name-only 2>&1 | Out-String).Trim()
$ErrorActionPreference = $prev

if (-not $staged) {
  Write-Host "No web file changes to publish." -ForegroundColor Yellow
  exit 0
}

Invoke-Git commit -m $Message
Invoke-Git pull origin main --rebase --autostash
Invoke-Git push origin main

Write-Host "Done: https://emadabuhoujaila.github.io/science-portal/" -ForegroundColor Green
