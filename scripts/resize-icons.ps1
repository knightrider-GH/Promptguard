Add-Type -AssemblyName System.Drawing

$baseDir = Split-Path -Parent $PSScriptRoot
$destDir = Join-Path $baseDir "icons"
$srcPath = Join-Path $destDir "icon-original.png"

if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

# Copy full resolution original
Copy-Item -Path $srcPath -Destination (Join-Path $destDir "icon-original.png") -Force

$sizes = @(16, 32, 48, 128)

$srcImage = [System.Drawing.Image]::FromFile($srcPath)

foreach ($size in $sizes) {
    $destBitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $destRect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $graphics.DrawImage($srcImage, $destRect, 0, 0, $srcImage.Width, $srcImage.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $outPath = Join-Path $destDir "icon$size.png"
    $destBitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $destBitmap.Dispose()
    Write-Host "Generated: $outPath ($size x $size)"
}

$srcImage.Dispose()
Write-Host "All icons generated successfully!"
