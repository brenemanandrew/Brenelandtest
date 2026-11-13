import sys
from PIL import Image, ImageDraw
for f in sys.argv[1:]:
    im=Image.open(f).convert('RGB'); d=ImageDraw.Draw(im)
    S=500; CZ=0.93
    for i in range(-10,11):
        x=500+i*0.1*S; d.line([(x,0),(x,1000)],fill=(255,0,0) if i==0 else (150,150,255),width=1)
        d.text((x+2,2),f"{i/10:.1f}",fill=(200,0,0))
    for j in range(0,20):
        y=500-(j*0.1-CZ)*S; d.line([(0,y),(1000,y)],fill=(150,150,255),width=1); d.text((2,y-12),f"{j/10:.1f}",fill=(200,0,0))
    im.save(f.replace('.png','_g.png'))
