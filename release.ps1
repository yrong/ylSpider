webpack
showdown makehtml -i README.md -o README.html -u UTF8 --tables

$zipName="release.zip"
if (Test-Path $zipName) 
{
  Remove-Item $zipName
}

$compress = @{
  Path = "dist","public",".env.example","package.json","package-lock.json","install.bat","install.ps1", "ecosystem.config.js","README.html","appreciate.jpg","analysis.png","detail.png"
  CompressionLevel = "Fastest"
  DestinationPath = $zipName
}
Compress-Archive @compress
