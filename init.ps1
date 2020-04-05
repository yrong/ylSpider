### CONFIGURATION

write-host "check administator rights"
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
   write-Warning "This setup needs admin permissions. Please run this file as admin."
   break
}

Start-Process -Wait -FilePath dotNetFx40_Full_setup

write-host "install chocolatey"
if (Get-Command choco -errorAction SilentlyContinue) {
    $choco_current_version = (choco --version)
    write-host "[choco] $choco_current_version detected,ignore install"
}else{
    write-host "install choco:"
    Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
}

write-host "install node by choco"
if (Get-Command node -errorAction SilentlyContinue) {
	$node_ver=(Get-Command node | Select-Object -ExpandProperty Version).toString()
	if ([System.Version]$node_ver -lt [System.Version]"8.0.0") {
		write-Warning "node installed but version too old,please upgrade or reinstall"
		break
	}
}else{
	choco install -y nodejs-lts
	$env:Path += ";C:\Program Files\nodejs\"
	$env:Path += ";$Env:USERPROFILE\AppData\Roaming\npm\"
	refreshenv
}

write-host "intall pm2"
npm install pm2 -g
npm install pm2-windows-startup -g

write-host "install application as service"
npm install
pm2 reload ecosystem.config.js
pm2-startup install
pm2 save

write-host "Done !"