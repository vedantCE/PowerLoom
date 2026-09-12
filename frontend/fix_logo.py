"""
Fix logo.jpg: replace near-black/dark background pixels with white,
then save as logo_white.png for use in the app.
"""
from PIL import Image
import numpy as np

img = Image.open("public/logo.jpg").convert("RGBA")
data = np.array(img, dtype=np.float32)

r = data[:, :, 0]
g = data[:, :, 1]
b = data[:, :, 2]

# --- Method 1: Remove near-black pixels (threshold = 60) ---
threshold = 60
black_mask = (r < threshold) & (g < threshold) & (b < threshold)

# Replace those pixels with white
data[black_mask, 0] = 255
data[black_mask, 1] = 255
data[black_mask, 2] = 255
data[black_mask, 3] = 255

result = Image.fromarray(data.astype(np.uint8))
result.save("public/logo_white.png")
print(f"Saved logo_white.png — replaced {black_mask.sum()} dark pixels with white")

# Also check if there are very dark pixels (near-black but not pure black)
# with a wider threshold for aggressive background removal
data2 = np.array(Image.open("public/logo.jpg").convert("RGBA"), dtype=np.float32)
r2 = data2[:, :, 0]
g2 = data2[:, :, 1]
b2 = data2[:, :, 2]

# Wider threshold: dark grey areas too
threshold2 = 30
mask2 = (r2 < threshold2) & (g2 < threshold2) & (b2 < threshold2)
data2[mask2, 0] = 255
data2[mask2, 1] = 255
data2[mask2, 2] = 255
data2[mask2, 3] = 255

result2 = Image.fromarray(data2.astype(np.uint8))
result2.save("public/logo_white_strict.png")
print(f"Saved logo_white_strict.png — replaced {mask2.sum()} very dark pixels with white")

# Print image info
img_orig = Image.open("public/logo.jpg")
print(f"Original size: {img_orig.size}, mode: {img_orig.mode}")
