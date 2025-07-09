# extract_pdf_to_json.py
import fitz  # PyMuPDF
import json
import os

def save_clean_backgrounds(pdf_path, image_dir="images_clean"):
    print(f"Saving cleaned background images to: {image_dir}")
    os.makedirs(image_dir, exist_ok=True)
    doc = fitz.open(pdf_path)

    for i, page in enumerate(doc):
        # Temporarily remove text blocks by creating a copy of the page with vector content only
        text_instances = page.get_text("dict")["blocks"]

        # Remove text blocks without adding fill (clean transparent removal)
        for block in text_instances:
            if block["type"] == 0:  # type 0 = text
                rect = fitz.Rect(block["bbox"])
                page.add_redact_annot(rect, text="")  # Remove text without fill


        # Apply redactions (removes text visually)
        page.apply_redactions()

        # Save background image
        pix = page.get_pixmap(dpi=150)
        pix.save(os.path.join(image_dir, f"page_{i + 1}.png"))

    print(f"Saved cleaned background images to: {image_dir}")


def process_pdf_file(pdf_path, json_path, clean_image_dir="images_clean"):
    # create clean_images
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
        for block in blocks:
            if block["type"] == 0:
                for line in block["lines"]:
                    for span in line["spans"]:
                        # Handle color conversion properly
                        color_int = span["color"]
                        if isinstance(color_int, int):
                            # Convert integer color to RGB
                            r = (color_int >> 16) & 0xFF
                            g = (color_int >> 8) & 0xFF
                            b = color_int & 0xFF
                            color_hex = "#{:02x}{:02x}{:02x}".format(r, g, b)
                        elif isinstance(color_int, (list, tuple)) and len(color_int) >= 3:
                            # Handle case where color is already RGB values
                            color_hex = "#{:02x}{:02x}{:02x}".format(int(color_int[0]), int(color_int[1]), int(color_int[2]))
                        else:
                            # Default to black if color format is unexpected
                            color_hex = "#000000"
                        
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

        result.append(page_data)

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    return result
