import os
import subprocess

startup_dir = os.path.expandvars(r'%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup')
print(f"Startup Directory: {startup_dir}")
files = os.listdir(startup_dir)
print(f"Files in Startup: {files}")

# Verify target of DeepComputersServer.lnk
vbs_check = f'''
Set sh = CreateObject("WScript.Shell")
Set sc = sh.CreateShortcut("{startup_dir}\\DeepComputersServer.lnk")
WScript.Echo "Target: " & sc.TargetPath
WScript.Echo "WorkingDir: " & sc.WorkingDirectory
WScript.Echo "WindowStyle: " & sc.WindowStyle
'''

with open("tools/inspect_shortcut.vbs", "w") as f:
    f.write(vbs_check)

res = subprocess.run(["cscript", "//nologo", "tools/inspect_shortcut.vbs"], capture_output=True, text=True)
print("Shortcut Configuration:")
print(res.stdout)
