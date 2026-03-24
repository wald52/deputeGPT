Add-Type -AssemblyName System.Drawing

function New-Color {
  param(
    [int]$Alpha,
    [int]$Red,
    [int]$Green,
    [int]$Blue
  )

  return [System.Drawing.Color]::FromArgb($Alpha, $Red, $Green, $Blue)
}

function New-RectF {
  param(
    [double]$X,
    [double]$Y,
    [double]$Width,
    [double]$Height
  )

  return [System.Drawing.RectangleF]::new([float]$X, [float]$Y, [float]$Width, [float]$Height)
}

function New-PointF {
  param(
    [double]$X,
    [double]$Y
  )

  return [System.Drawing.PointF]::new([float]$X, [float]$Y)
}

function New-RoundedRectPath {
  param(
    [System.Drawing.RectangleF]$Rect,
    [double]$Radius
  )

  $diameter = [float]($Radius * 2)
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()

  $path.AddArc($Rect.X, $Rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Rect.Right - $diameter, $Rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Rect.X, $Rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  return $path
}

function Map-Point {
  param(
    [System.Drawing.RectangleF]$Rect,
    [double]$X,
    [double]$Y
  )

  return (New-PointF ($Rect.X + ($Rect.Width * $X)) ($Rect.Y + ($Rect.Height * $Y)))
}

function Map-Rect {
  param(
    [System.Drawing.RectangleF]$Rect,
    [double]$X,
    [double]$Y,
    [double]$Width,
    [double]$Height
  )

  return (New-RectF ($Rect.X + ($Rect.Width * $X)) ($Rect.Y + ($Rect.Height * $Y)) ($Rect.Width * $Width) ($Rect.Height * $Height))
}

function Fill-GradientRect {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.RectangleF]$Rect,
    [System.Drawing.Color]$TopColor,
    [System.Drawing.Color]$BottomColor
  )

  $brush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    $Rect,
    $TopColor,
    $BottomColor,
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
  )

  try {
    $Graphics.FillRectangle($brush, $Rect)
  } finally {
    $brush.Dispose()
  }
}

function Fill-RadialGlow {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.RectangleF]$Rect,
    [System.Drawing.Color]$CenterColor,
    [System.Drawing.Color]$EdgeColor
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  try {
    $path.AddEllipse($Rect)
    $brush = [System.Drawing.Drawing2D.PathGradientBrush]::new($path)
    try {
      $brush.CenterColor = $CenterColor
      $brush.SurroundColors = [System.Drawing.Color[]]@($EdgeColor)
      $Graphics.FillEllipse($brush, $Rect)
    } finally {
      $brush.Dispose()
    }
  } finally {
    $path.Dispose()
  }
}

function Fill-PathWithSolidBrush {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Drawing2D.GraphicsPath]$Path,
    [System.Drawing.Color]$Color
  )

  $brush = [System.Drawing.SolidBrush]::new($Color)
  try {
    $Graphics.FillPath($brush, $Path)
  } finally {
    $brush.Dispose()
  }
}

function Draw-Path {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Drawing2D.GraphicsPath]$Path,
    [System.Drawing.Color]$Color,
    [double]$Width
  )

  $pen = [System.Drawing.Pen]::new($Color, [float]$Width)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  try {
    $Graphics.DrawPath($pen, $Path)
  } finally {
    $pen.Dispose()
  }
}

function Draw-Line {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.PointF]$Start,
    [System.Drawing.PointF]$End,
    [System.Drawing.Color]$Color,
    [double]$Width
  )

  $pen = [System.Drawing.Pen]::new($Color, [float]$Width)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  try {
    $Graphics.DrawLine($pen, $Start, $End)
  } finally {
    $pen.Dispose()
  }
}

function Fill-Polygon {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.PointF[]]$Points,
    [System.Drawing.Color]$Color
  )

  $brush = [System.Drawing.SolidBrush]::new($Color)
  try {
    $Graphics.FillPolygon($brush, $Points)
  } finally {
    $brush.Dispose()
  }
}

function Draw-Columns {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.RectangleF]$Rect
  )

  $columnCount = 6
  $gap = $Rect.Width * 0.03
  $columnWidth = ($Rect.Width - ($gap * ($columnCount - 1))) / $columnCount

  for ($index = 0; $index -lt $columnCount; $index += 1) {
    $columnX = $Rect.X + (($columnWidth + $gap) * $index)
    $columnRect = New-RectF $columnX $Rect.Y $columnWidth $Rect.Height
    $fillBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $columnRect,
      (New-Color 255 255 255 255),
      (New-Color 255 118 118 121),
      [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
    )

    try {
      $Graphics.FillRectangle($fillBrush, $columnRect)
    } finally {
      $fillBrush.Dispose()
    }

    $edgePen = [System.Drawing.Pen]::new((New-Color 170 42 49 79), [float][Math]::Max(1, $Rect.Width * 0.008))
    try {
      $Graphics.DrawRectangle($edgePen, $columnRect.X, $columnRect.Y, $columnRect.Width, $columnRect.Height)
    } finally {
      $edgePen.Dispose()
    }
  }
}

function Draw-DeputeGptIcon {
  param(
    [int]$Size,
    [string]$OutputPath,
    [bool]$Maskable = $false
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $backgroundInset = if ($Maskable) { 0 } elseif ($Size -le 32) { $Size * 0.02 } else { $Size * 0.04 }
    $backgroundRect = New-RectF $backgroundInset $backgroundInset ($Size - ($backgroundInset * 2)) ($Size - ($backgroundInset * 2))
    $backgroundRadius = $backgroundRect.Width * 0.19
    $backgroundPath = New-RoundedRectPath $backgroundRect $backgroundRadius

    try {
      Fill-PathWithSolidBrush $graphics $backgroundPath (New-Color 255 12 18 38)
      $graphics.SetClip($backgroundPath)

      Fill-GradientRect $graphics (Map-Rect $backgroundRect 0 0 0.36 1) (New-Color 255 25 113 255) (New-Color 255 8 15 78)
      Fill-GradientRect $graphics (Map-Rect $backgroundRect 0.33 0 0.34 1) (New-Color 255 255 255 255) (New-Color 255 228 233 241)
      Fill-GradientRect $graphics (Map-Rect $backgroundRect 0.64 0 0.36 1) (New-Color 255 255 54 59) (New-Color 255 207 18 44)

      Fill-RadialGlow $graphics (Map-Rect $backgroundRect 0.02 -0.02 0.58 0.58) (New-Color 105 255 255 255) (New-Color 0 255 255 255)
      Fill-RadialGlow $graphics (Map-Rect $backgroundRect 0.55 0.12 0.40 0.40) (New-Color 60 255 128 128) (New-Color 0 255 255 255)
      Fill-RadialGlow $graphics (Map-Rect $backgroundRect 0.14 0.60 0.72 0.34) (New-Color 45 255 255 255) (New-Color 0 255 255 255)

      $artInset = if ($Maskable) { 0.09 } elseif ($Size -le 32) { 0.10 } else { 0.08 }
      $artRect = Map-Rect $backgroundRect $artInset $artInset (1 - ($artInset * 2)) (1 - ($artInset * 2))

      $bubbleOuterRect = Map-Rect $artRect 0.62 0.12 0.30 0.20
      $bubbleInnerRect = Map-Rect $artRect 0.635 0.14 0.27 0.17
      $bubbleOuterBrush = [System.Drawing.SolidBrush]::new((New-Color 255 255 255 255))
      $bubbleInnerBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $bubbleInnerRect,
        (New-Color 255 26 145 255),
        (New-Color 255 17 68 214),
        [System.Drawing.Drawing2D.LinearGradientMode]::Horizontal
      )

      try {
        $graphics.FillEllipse($bubbleOuterBrush, $bubbleOuterRect)
        $tailOuter = [System.Drawing.PointF[]]@(
          (Map-Point $artRect 0.67 0.29),
          (Map-Point $artRect 0.60 0.44),
          (Map-Point $artRect 0.73 0.33)
        )
        Fill-Polygon $graphics $tailOuter (New-Color 255 255 255 255)

        $graphics.FillEllipse($bubbleInnerBrush, $bubbleInnerRect)
        $tailInner = [System.Drawing.PointF[]]@(
          (Map-Point $artRect 0.685 0.29),
          (Map-Point $artRect 0.63 0.41),
          (Map-Point $artRect 0.74 0.33)
        )
        Fill-Polygon $graphics $tailInner (New-Color 255 18 86 233)

        foreach ($dotX in @(0.70, 0.78, 0.86)) {
          $dotRect = Map-Rect $artRect ($dotX - 0.025) 0.185 0.05 0.05
          $dotBrush = [System.Drawing.SolidBrush]::new((New-Color 255 255 255 255))
          try {
            $graphics.FillEllipse($dotBrush, $dotRect)
          } finally {
            $dotBrush.Dispose()
          }
        }
      } finally {
        $bubbleOuterBrush.Dispose()
        $bubbleInnerBrush.Dispose()
      }

      $bodyPath = [System.Drawing.Drawing2D.GraphicsPath]::new()
      try {
        $bodyPoints = [System.Drawing.PointF[]]@(
          (Map-Point $artRect 0.29 0.38),
          (Map-Point $artRect 0.22 0.47),
          (Map-Point $artRect 0.18 0.64),
          (Map-Point $artRect 0.17 0.92),
          (Map-Point $artRect 0.83 0.92),
          (Map-Point $artRect 0.82 0.63),
          (Map-Point $artRect 0.78 0.48),
          (Map-Point $artRect 0.70 0.39),
          (Map-Point $artRect 0.60 0.34),
          (Map-Point $artRect 0.58 0.48),
          (Map-Point $artRect 0.51 0.58),
          (Map-Point $artRect 0.44 0.48),
          (Map-Point $artRect 0.41 0.34)
        )

        $bodyPath.AddClosedCurve($bodyPoints, 0.18)
        Draw-Path $graphics $bodyPath (New-Color 255 255 255 255) ([Math]::Max(2, $artRect.Width * 0.025))
        Fill-PathWithSolidBrush $graphics $bodyPath (New-Color 255 20 46 130)

        $headShadowRect = Map-Rect $artRect 0.35 0.08 0.28 0.27
        $headRect = Map-Rect $artRect 0.34 0.06 0.28 0.27
        $headShadowBrush = [System.Drawing.SolidBrush]::new((New-Color 85 0 0 30))
        $headBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
          $headRect,
          (New-Color 255 24 55 154),
          (New-Color 255 13 34 104),
          [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
        )

        try {
          $graphics.FillEllipse($headShadowBrush, $headShadowRect)
          $graphics.FillEllipse($headBrush, $headRect)
        } finally {
          $headShadowBrush.Dispose()
          $headBrush.Dispose()
        }

        $headOutlinePen = [System.Drawing.Pen]::new((New-Color 255 14 30 98), [float][Math]::Max(1, $artRect.Width * 0.01))
        try {
          $graphics.DrawEllipse($headOutlinePen, $headRect)
        } finally {
          $headOutlinePen.Dispose()
        }

        $shoulderShadowRect = Map-Rect $artRect 0.20 0.40 0.60 0.52
        Fill-RadialGlow $graphics $shoulderShadowRect (New-Color 60 0 0 30) (New-Color 0 0 0 30)

        $graphics.SetClip($bodyPath, [System.Drawing.Drawing2D.CombineMode]::Intersect)
        Draw-Line $graphics (Map-Point $artRect 0.17 0.51) (Map-Point $artRect 0.57 1.00) (New-Color 255 255 255 255) ([Math]::Max(2, $artRect.Width * 0.12))
        Draw-Line $graphics (Map-Point $artRect 0.14 0.49) (Map-Point $artRect 0.54 0.98) (New-Color 255 17 86 233) ([Math]::Max(1.5, $artRect.Width * 0.036))
        Draw-Line $graphics (Map-Point $artRect 0.20 0.53) (Map-Point $artRect 0.60 1.02) (New-Color 255 229 28 49) ([Math]::Max(1.5, $artRect.Width * 0.036))

        $shirtPoints = [System.Drawing.PointF[]]@(
          (Map-Point $artRect 0.43 0.44),
          (Map-Point $artRect 0.50 0.59),
          (Map-Point $artRect 0.57 0.44),
          (Map-Point $artRect 0.54 0.36),
          (Map-Point $artRect 0.46 0.36)
        )
        Fill-Polygon $graphics $shirtPoints (New-Color 255 255 255 255)

        $tiePoints = [System.Drawing.PointF[]]@(
          (Map-Point $artRect 0.48 0.44),
          (Map-Point $artRect 0.52 0.44),
          (Map-Point $artRect 0.55 0.51),
          (Map-Point $artRect 0.50 0.61),
          (Map-Point $artRect 0.45 0.51)
        )
        Fill-Polygon $graphics $tiePoints (New-Color 255 24 45 103)

        $graphics.ResetClip()

        $badgeOuterRect = Map-Rect $artRect 0.43 0.68 0.12 0.13
        $badgeInnerRect = Map-Rect $artRect 0.445 0.695 0.09 0.10
        $badgeOuterPath = New-RoundedRectPath $badgeOuterRect ($badgeOuterRect.Width * 0.18)
        $badgeInnerPath = New-RoundedRectPath $badgeInnerRect ($badgeInnerRect.Width * 0.14)

        try {
          Fill-PathWithSolidBrush $graphics $badgeOuterPath (New-Color 255 255 255 255)
          Fill-PathWithSolidBrush $graphics $badgeInnerPath (New-Color 255 240 240 246)
          $graphics.SetClip($badgeInnerPath, [System.Drawing.Drawing2D.CombineMode]::Intersect)
          Fill-GradientRect $graphics (Map-Rect $badgeInnerRect 0 0 0.34 1) (New-Color 255 16 82 229) (New-Color 255 23 74 199)
          Fill-GradientRect $graphics (Map-Rect $badgeInnerRect 0.33 0 0.34 1) (New-Color 255 255 255 255) (New-Color 255 232 236 241)
          Fill-GradientRect $graphics (Map-Rect $badgeInnerRect 0.66 0 0.34 1) (New-Color 255 232 40 49) (New-Color 255 203 15 32)
          $graphics.ResetClip()
        } finally {
          $badgeOuterPath.Dispose()
          $badgeInnerPath.Dispose()
        }
      } finally {
        $bodyPath.Dispose()
      }

      $buildingShadowRect = Map-Rect $artRect 0.15 0.66 0.72 0.29
      Fill-RadialGlow $graphics $buildingShadowRect (New-Color 80 0 0 0) (New-Color 0 0 0 0)

      $roofOuterPoints = [System.Drawing.PointF[]]@(
        (Map-Point $artRect 0.12 0.78),
        (Map-Point $artRect 0.50 0.64),
        (Map-Point $artRect 0.88 0.78),
        (Map-Point $artRect 0.88 0.84),
        (Map-Point $artRect 0.12 0.84)
      )
      Fill-Polygon $graphics $roofOuterPoints (New-Color 255 255 255 255)

      $roofInnerPoints = [System.Drawing.PointF[]]@(
        (Map-Point $artRect 0.16 0.78),
        (Map-Point $artRect 0.50 0.67),
        (Map-Point $artRect 0.84 0.78),
        (Map-Point $artRect 0.84 0.81),
        (Map-Point $artRect 0.16 0.81)
      )
      Fill-Polygon $graphics $roofInnerPoints (New-Color 255 225 226 225)

      Draw-Line $graphics (Map-Point $artRect 0.17 0.79) (Map-Point $artRect 0.50 0.69) (New-Color 255 23 53 158) ([Math]::Max(1, $artRect.Width * 0.011))
      Draw-Line $graphics (Map-Point $artRect 0.83 0.79) (Map-Point $artRect 0.50 0.69) (New-Color 255 23 53 158) ([Math]::Max(1, $artRect.Width * 0.011))

      $entablatureRect = Map-Rect $artRect 0.15 0.81 0.70 0.05
      Fill-GradientRect $graphics $entablatureRect (New-Color 255 241 241 239) (New-Color 255 154 157 164)

      foreach ($figureX in @(0.40, 0.46, 0.54, 0.60)) {
        $figureHeadRect = Map-Rect $artRect ($figureX - 0.012) 0.74 0.024 0.03
        $figureBodyRect = Map-Rect $artRect ($figureX - 0.008) 0.76 0.016 0.035
        $figureBrush = [System.Drawing.SolidBrush]::new((New-Color 210 255 252 244))
        try {
          $graphics.FillEllipse($figureBrush, $figureHeadRect)
          $graphics.FillRectangle($figureBrush, $figureBodyRect)
        } finally {
          $figureBrush.Dispose()
        }
      }

      $columnsRect = Map-Rect $artRect 0.18 0.86 0.64 0.17
      Draw-Columns $graphics $columnsRect

      $baseRect = Map-Rect $artRect 0.14 1.01 0.72 0.05
      Fill-GradientRect $graphics $baseRect (New-Color 255 121 126 145) (New-Color 255 40 45 64)

      $graphics.ResetClip()
      Draw-Path $graphics $backgroundPath (New-Color 110 255 255 255) ([Math]::Max(1, $backgroundRect.Width * 0.005))
    } finally {
      $backgroundPath.Dispose()
    }

    $directory = Split-Path -Parent $OutputPath
    if ($directory) {
      [System.IO.Directory]::CreateDirectory($directory) | Out-Null
    }

    $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'public\icons'

$specs = @(
  @{ fileName = 'favicon-16x16.png'; size = 16; maskable = $false },
  @{ fileName = 'favicon-32x32.png'; size = 32; maskable = $false },
  @{ fileName = 'favicon-48x48.png'; size = 48; maskable = $false },
  @{ fileName = 'apple-touch-icon.png'; size = 180; maskable = $false },
  @{ fileName = 'icon-192.png'; size = 192; maskable = $false },
  @{ fileName = 'icon-512.png'; size = 512; maskable = $false },
  @{ fileName = 'icon-maskable-192.png'; size = 192; maskable = $true },
  @{ fileName = 'icon-maskable-512.png'; size = 512; maskable = $true }
)

foreach ($spec in $specs) {
  $outputPath = Join-Path $iconsDir $spec.fileName
  Draw-DeputeGptIcon -Size $spec.size -OutputPath $outputPath -Maskable $spec.maskable
  Write-Host "Icone generee: $($spec.fileName)"
}
