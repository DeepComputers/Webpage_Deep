$wsh = New-Object -ComObject WScript.Shell
$scPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\DeepComputersServer.lnk'
$sc = $wsh.CreateShortcut($scPath)
[PSCustomObject]@{
    Target = $sc.TargetPath
    WorkingDir = $sc.WorkingDirectory
    Style = $sc.WindowStyle
} | Format-List
