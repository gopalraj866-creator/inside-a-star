import sys, glob, os
from PIL import Image, ImageDraw
files = sys.argv[2:]
out = sys.argv[1]
cols = 3
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
sc = 0.5 if w > 900 else 1.0
tw, th = int(w*sc), int(h*sc)
rows = (len(ims)+cols-1)//cols
sheet = Image.new('RGB', (cols*tw, rows*th))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th)), ((i%cols)*tw, (i//cols)*th))
sheet.save(out)
print(out, sheet.size)
