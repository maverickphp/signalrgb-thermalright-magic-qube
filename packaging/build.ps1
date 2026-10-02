# Builds dist\MagicQubeHelper.zip: the helper as one exe plus the install/uninstall scripts.
#   powershell -ExecutionPolicy Bypass -File packaging\build.ps1 -LhmPath "C:\path\to\LibreHardwareMonitor"
# LhmPath is the extracted LibreHardwareMonitor.zip release (the .NET Framework build).
param([Parameter(Mandatory)][string]$LhmPath)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$python = Join-Path $root ".venv\Scripts\python.exe"
$build = Join-Path $root "build"
$dist = Join-Path $root "dist"
$stage = Join-Path $dist "MagicQubeHelper"

Remove-Item $build, $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force (Join-Path $build "lhm"), $stage | Out-Null

# LibreHardwareMonitorLib and the libraries it needs; the app's UI assemblies stay behind.
$uiOnly = "Aga.Controls.dll", "OxyPlot.dll", "OxyPlot.WindowsForms.dll", "Microsoft.Win32.TaskScheduler.dll"
Get-ChildItem $LhmPath -Filter *.dll | Where-Object { $uiOnly -notcontains $_.Name } |
    Copy-Item -Destination (Join-Path $build "lhm")
if (-not (Test-Path (Join-Path $build "lhm\LibreHardwareMonitorLib.dll"))) {
    throw "LibreHardwareMonitorLib.dll not found in $LhmPath"
}

& $python -m pip install -q pythonnet pyinstaller
& $python -m PyInstaller --noconfirm --onefile --noconsole --name MagicQubeHelper `
    --distpath $stage --workpath (Join-Path $build "pyinstaller") --specpath $build `
    --add-data "$(Join-Path $build 'lhm');lhm" `
    --collect-all pythonnet --collect-all clr_loader `
    (Join-Path $root "helper\magic_qube_helper.py")
if ($LASTEXITCODE) { throw "PyInstaller failed" }

Copy-Item (Join-Path $PSScriptRoot "install.ps1"), (Join-Path $PSScriptRoot "uninstall.ps1"), `
    (Join-Path $PSScriptRoot "Install.cmd"), (Join-Path $PSScriptRoot "Uninstall.cmd"), `
    (Join-Path $PSScriptRoot "README.txt") $stage
Copy-Item (Join-Path $root "LICENSE") (Join-Path $stage "LICENSE.txt")
Copy-Item (Join-Path $PSScriptRoot "LibreHardwareMonitor-LICENSE.txt") $stage

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath (Join-Path $dist "MagicQubeHelper.zip")
Write-Host "Built $(Join-Path $dist 'MagicQubeHelper.zip')"
