### CONFIGURATION

write-host "check administator rights"
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
   write-Warning "This setup needs admin permissions. Please run this file as admin."
   break
}

Set-ExecutionPolicy -ExecutionPolicy unrestricted -Scope CurrentUser
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12


write-host "install chocolatey"
if (Get-Command choco -errorAction SilentlyContinue) {
    $choco_current_version = (choco --version)
    write-host "[choco] $choco_current_version detected,ignore install"
}else{
    write-host "install choco:"
    Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))
    refreshenv
}

write-host "install chrome by chocolatey"
if(choco list -lo | Where-object { $_.ToLower().StartsWith("GoogleChrome".ToLower()) }){
		write-host "chrome detected,ignore install"
}else{
	choco install -y googlechrome
	$env:Path += ";C:\Program Files (x86)\Google\Chrome\Application"
	refreshenv
}

$useSearchService=$false
if ($useSearchService) {
	write-host "install jdk and elasticsearch by chocolatey"
	if (Get-Command java -errorAction SilentlyContinue) {
		write-host "java detected,ignore install"
	}else{
		choco install -y jdk8
		refreshenv
		choco install -y elasticsearch
		refreshenv
		Start-Service elasticsearch-service-x64
	}
}else{
	write-host "skip use search service"
}


write-host "install node by chocolatey"
if (Get-Command node -errorAction SilentlyContinue) {
	$node_ver=(Get-Command node | Select-Object -ExpandProperty Version).toString()
	if ([System.Version]$node_ver -lt [System.Version]"9.0.0") {
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
if (Get-Command pm2 -errorAction SilentlyContinue) {
	write-host "pm2 detected,ignore install"
}else{
	npm install pm2 -g
	npm install pm2-windows-startup -g
}

write-host "generate env file from template"
((Get-Content -path .env.example -Encoding UTF8) -replace 'ronyang',$env:UserName) | Out-File -Encoding UTF8 .env

write-host "install application as service"
npm install
pm2 reload ecosystem.config.js
pm2-startup install
pm2 save

write-host "Done !"