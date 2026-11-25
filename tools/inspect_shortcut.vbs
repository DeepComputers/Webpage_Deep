
Set sh = CreateObject("WScript.Shell")
Set sc = sh.CreateShortcut("C:\Users\WORK\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\DeepComputersServer.lnk")
WScript.Echo "Target: " & sc.TargetPath
WScript.Echo "WorkingDir: " & sc.WorkingDirectory
WScript.Echo "WindowStyle: " & sc.WindowStyle
