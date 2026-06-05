"use client";

import { useState } from "react";
import ImageLightbox from "./ImageLightbox";

interface Props {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function ClickableImage({ src, alt = "Image", className = "", style }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <img
        src={src}
        alt={alt}
        className={`cursor-pointer ${className}`}
        style={style}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      />
      {open && <ImageLightbox src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
