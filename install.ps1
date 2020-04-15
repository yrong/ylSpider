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


npm install --only=prod
$installApplicationAsService=$false
if ($installApplicationAsService) {
    write-host "install application as service"
    pm2 reload ecosystem.config.js
    pm2-startup install
    pm2 save
}


write-host "begin to install jdk and elasticsearch"
$java_version="jdk-13"
$java_url="https://repo.huaweicloud.com/java/jdk/13+33/jdk-13_windows-x64_bin.exe"
$elastic_version="7.3.2"
$elastic_url="https://elasticsearch.thans.cn/downloads/elasticsearch/elasticsearch-$elastic_version-no-jdk-windows-x86_64.zip"
function refreshJava {
	$JAVA_HOME="C:\Program Files\Java\$java_version"
	$env:JAVA_HOME=$JAVA_HOME
	$env:Path+=";$JAVA_HOME\bin"
	refreshenv
}
$installSearchService = Read-Host "install search service for analysis?(y/n)"
if ($installSearchService -eq 'y') {
	if (Get-Command java -errorAction SilentlyContinue) {
		write-host "java detected,ignore install"
	}else{
		$exist = (Test-Path -path "$java_version.exe")
		if (!$exist) {
			write-host "download java,please wait..."
			Invoke-WebRequest -UseBasicParsing -OutFile "$java_version.exe" $java_url
		}else{
			write-host "java install package detected,ignore download and just install"
		}
		Start-Process "$java_version.exe" -wait -ArgumentList '/s INSTALL_SILENT=1 STATIC=0 AUTO_UPDATE=0 WEB_JAVA=1 WEB_JAVA_SECURITY_LEVEL=H WEB_ANALYTICS=0 EULA=0 REBOOT=0 NOSTARTMENU=0 SPONSORS=0'
		refreshJava
	}
	$exist = (Test-Path -path elasticsearch-$elastic_version.zip)
	if (!$exist) {
		write-host "download elasticsearch,please wait..."
		Invoke-WebRequest -UseBasicParsing -OutFile "elasticsearch-$elastic_version.zip" $elastic_url
		Expand-Archive -Path elasticsearch-$elastic_version.zip -DestinationPath .
	}
	$running = Get-NetTCPConnection -State Listen | Where-Object {$_.LocalPort -eq "9200"}
	if ($running) {
		Write-Host "elasticsearch already running"
	}
	else {
		Write-Host "elasticsearch not running,start"
		refreshJava
		Start-Process -FilePath "elasticsearch-$elastic_version\bin\elasticsearch"
	}
}else{
	write-host "skip use search service"
}

write-host "generate env file from template"
$x = Get-Content -path .env.example -Encoding UTF8
$x = $x -replace 'ronyang',$env:UserName
if ($installSearchService -eq 'y') {
	$x = $x -replace 'SaveSearch=false', 'SaveSearch=true'
}
Set-Content -Path .env -Value $x -Encoding UTF8

write-host "install finished,config .env file then type ""npm run download"" to download contract"
