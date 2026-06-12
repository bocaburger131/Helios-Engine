@echo off
NET SESSION >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    powershell Start-Process '%~0' -Verb RunAs
    exit
)

echo Enabling Windows Subsystem for Linux...
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart

echo Enabling Virtual Machine Platform...
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart

echo Installing WSL...
powershell.exe -Command "wsl --install"

echo Please restart your computer to complete the installation.
pause