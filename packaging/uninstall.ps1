# Removes the Magic Qube helper. Run through Uninstall.cmd, which asks for admin rights first.
$taskName = "Thermalright Magic Qube Helper"
$installDir = Join-Path $env:ProgramFiles "MagicQubeHelper"

Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Stop-ScheduledTask
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-Process MagicQubeHelper -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
# Run from inside the install folder, the folder can only go once this script has exited.
if ($PSScriptRoot -ieq $installDir) {
    Start-Process cmd.exe -ArgumentList "/c timeout /t 2 >nul & rmdir /s /q `"$installDir`"" -WindowStyle Hidden
} else {
    Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Host "Removed the Magic Qube helper and its logon task."
Write-Host "To finish, remove the addon in SignalRGB's Addons page. Thermalright's TRCC can be used again."
