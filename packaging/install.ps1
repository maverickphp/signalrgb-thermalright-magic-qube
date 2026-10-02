# Installs the Magic Qube helper. Run through Install.cmd, which asks for admin rights first.
$ErrorActionPreference = "Stop"
$taskName = "Thermalright Magic Qube Helper"
$installDir = Join-Path $env:ProgramFiles "MagicQubeHelper"
$exe = Join-Path $installDir "MagicQubeHelper.exe"
$addonUrl = "https://github.com/maverickphp/signalrgb-thermalright-magic-qube"

function Step($text) { Write-Host "`n> $text" -ForegroundColor Cyan }

# The account that is logged in, even when an admin account was used to elevate.
$user = (Get-CimInstance Win32_ComputerSystem).UserName
if (-not $user) { $user = "$env:USERDOMAIN\$env:USERNAME" }

Write-Host "Thermalright Magic Qube helper - installer" -ForegroundColor White
Write-Host "Installing for $user into $installDir"

Step "Stopping Thermalright Control Center (TRCC) and its autostart"
Get-Process TRCC -ErrorAction SilentlyContinue | Stop-Process -Force
foreach ($key in "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run",
                 "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run",
                 "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run") {
    $props = Get-ItemProperty $key -ErrorAction SilentlyContinue
    if (-not $props) { continue }
    foreach ($p in $props.PSObject.Properties) {
        if ("$($p.Value)" -match "TRCC\.exe") {
            Remove-ItemProperty $key -Name $p.Name
            Write-Host "  removed startup entry '$($p.Name)'"
        }
    }
}
Get-ChildItem "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup",
              "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\StartUp" -ErrorAction SilentlyContinue |
    Where-Object Name -match "TRCC" | ForEach-Object { Remove-Item $_.FullName; Write-Host "  removed $($_.Name)" }
Get-ScheduledTask -ErrorAction SilentlyContinue |
    Where-Object { ($_.Actions.Execute -join " ") -match "TRCC\.exe" } |
    ForEach-Object { Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath | Out-Null
                     Write-Host "  disabled task '$($_.TaskName)'" }

Step "Checking the PawnIO driver (needed for CPU temperature)"
if (Get-Service PawnIO -ErrorAction SilentlyContinue) {
    Write-Host "  PawnIO is installed."
} else {
    Write-Host "  PawnIO is not installed. Without it the display shows GPU readings and CPU load, but no CPU temperature."
    $answer = Read-Host "  Install PawnIO now with winget (namazso.PawnIO)? [Y/n]"
    if ($answer -notmatch "^[nN]") {
        winget install --id namazso.PawnIO -e --accept-package-agreements --accept-source-agreements
    } else {
        Write-Host "  Skipped. You can install it later from https://pawnio.eu"
    }
}

Step "Installing the helper"
Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Stop-ScheduledTask
Get-Process MagicQubeHelper -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
New-Item -ItemType Directory -Force $installDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot "MagicQubeHelper.exe"), (Join-Path $PSScriptRoot "uninstall.ps1"),
          (Join-Path $PSScriptRoot "Uninstall.cmd") $installDir -Force
Get-ChildItem $PSScriptRoot -Filter "*LICENSE*" | Copy-Item -Destination $installDir -Force

Step "Starting it at logon (hidden, with admin rights for CPU temperature)"
$action = New-ScheduledTaskAction -Execute $exe
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal `
    -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Host "  Task '$taskName' registered and started."

Write-Host "`nDone. Last step, in SignalRGB:" -ForegroundColor Green
Write-Host "  1. Open Addons and add: $addonUrl"
Write-Host "  2. Quit SignalRGB from the tray icon and open it again."
Write-Host "The display shows live CPU/GPU readings now, and takes your effect colors once SignalRGB is set up."
Write-Host "To remove everything, run Uninstall.cmd (also copied to $installDir)."
