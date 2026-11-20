; Build with Inno Setup 6 and /DBundleDir=<absolute packaged desktop directory>.
[Setup]
AppId=BookContentStudio
AppName=BookContentStudio
AppVersion=1.0.0
DefaultDirName={localappdata}\Programs\BookContentStudio
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=BookContentStudio-Setup-x64
WizardStyle=modern
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\electron\electron.exe

[Files]
Source: "{#BundleDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\BookContentStudio"; Filename: "{app}\books-desktop.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\electron\electron.exe"; Flags: runminimized
