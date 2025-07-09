import fitz  # PyMuPDF
import os
import json

def save_clean_backgrounds(pdf_path, image_dir="images_clean"):
    print(f"Saving cleaned background images to: {image_dir}")
    os.makedirs(image_dir, exist_ok=True)
    doc = fitz.open(pdf_path)

    for i, page in enumerate(doc):
        blocks = page.get_text("dict")["blocks"]

        # Remove both text and images
        for block in blocks:
            if block["type"] in (0, 1):  # 0=text, 1=image
                rect = fitz.Rect(block["bbox"])
                page.add_redact_annot(rect, text="")

        page.apply_redactions()

        pix = page.get_pixmap(dpi=150)
        pix.save(os.path.join(image_dir, f"page_{i + 1}.png"))

    print(f"Saved cleaned background images to: {image_dir}")


def process_pdf_file(pdf_path, json_path, clean_image_dir="images_clean"):
    save_clean_backgrounds(pdf_path, clean_image_dir)
    doc = fitz.open(pdf_path)
    result = []

    for page_num, page in enumerate(doc):
        page_data = {
            "width": page.rect.width,
            "height": page.rect.height,
            "background": f"{clean_image_dir}/page_{page_num + 1}.png",
            "elements": []
        }

        blocks = page.get_text("dict")["blocks"]
        image_counter = 0
        for block in blocks:
            if block["type"] == 0:
                # TEXT
                for line in block["lines"]:
                    for span in line["spans"]:
                        color_int = span["color"]
                        r = (color_int >> 16) & 0xFF
                        g = (color_int >> 8) & 0xFF
                        b = color_int & 0xFF
                        color_hex = "#{:02x}{:02x}{:02x}".format(r, g, b)

                        el = {
                            "type": "text",
                            "text": span["text"],
                            "x": span["bbox"][0],
                            "y": span["bbox"][1],
                            "width": span["bbox"][2] - span["bbox"][0],
                            "height": span["bbox"][3] - span["bbox"][1],
                            "font_size": span["size"],
                            "font": span["font"],
                            "color": color_hex
                        }
                        page_data["elements"].append(el)

            elif block["type"] == 1:
                # IMAGE
                rect = block["bbox"]
                x0, y0, x1, y1 = rect
                pix = page.get_pixmap(clip=fitz.Rect(rect))
                img_path = f"{clean_image_dir}/page_{page_num + 1}_img_{image_counter}.png"
                pix.save(img_path)
                image_counter += 1

                el = {
                    "type": "image",
                    "src": img_path,
                    "x": x0,
                    "y": y0,
                    "width": x1 - x0,
                    "height": y1 - y0
                }
                page_data["elements"].append(el)

        result.append(page_data)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    return result


