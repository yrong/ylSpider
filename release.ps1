webpack

$readme="yooli.html"
showdown makehtml -i README.md -o $readme -u UTF8 --tables
"<meta charset=""UTF-8"">" + (Get-Content $readme -Encoding UTF8) | Set-Content $readme -Encoding UTF8

$zipName="release.zip"
if (Test-Path $zipName) 
{
  Remove-Item $zipName
}

if (Test-Path .env) 
{
	move-item -path .env -destination .envbak -Force
}

copy-item -path .env.example -destination .env


$compress = @{
  Path = "dist","public",".env.example",".env","package.json","package-lock.json","install.bat","install.ps1","start.bat","start.ps1","ecosystem.config.js",$readme,"appreciate.jpg","analysis.png","detail.png"
  CompressionLevel = "Fastest"
  DestinationPath = $zipName
}
Compress-Archive @compress

if (Test-Path .envbak) 
{
	move-item -path .envbak -destination .env -Force
}


