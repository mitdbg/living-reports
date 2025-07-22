# pip install playwright==1.* && playwright install chromium
import json
from pathlib import Path
from typing import Optional, Union

from playwright.async_api import async_playwright

# Add lzstring for compression
try:
    from lzstring import LZString
except ImportError:
    LZString = None

EDITOR_URL = "https://hms-dbmi.github.io/udi-grammar/#/Editor"


def compress_spec_for_url(spec):
    if LZString is None:
        raise ImportError("Please install lzstring: pip install lzstring")
    lz = LZString()
    json_str = json.dumps(spec, indent=2)
    compressed = lz.compressToEncodedURIComponent(json_str)
    return compressed

async def udi_to_png(udi_spec: dict,
                out_file: Union[str, Path] = "chart.png",
                *,
                headless: Optional[bool] = True,
                timeout: int = 10_000,          # ms
) -> Path:
    """
    Render `udi_spec` in the public editor and download the PNG that the UI
    would give you when you click “Save as PNG”.

    Returns the absolute path to the written file.
    """
    out_file = Path(out_file).expanduser().resolve()
    # Compress the spec and build the URL
    compressed_spec = compress_spec_for_url(udi_spec)
    url = f"{EDITOR_URL}?spec={compressed_spec}"
    print("URL: ", url)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        page = await browser.new_page()

        # 1. open the site with the spec in the URL
        await page.goto(url, wait_until="domcontentloaded")

        # 2. wait until Vega finished (canvas exists)
        await page.wait_for_selector(".vega-chart-container canvas", timeout=timeout)

        # 3. open action menu (three dots) if not already open
        await page.locator('details[title="Click to view actions"] summary').click()

        # 4. click “Save as PNG” and intercept the download
        async with page.expect_download() as dl_info:
            await page.locator('.vega-actions a[download$=".png"]').click()
        dl = await dl_info.value
        await dl.save_as(str(out_file))

        await browser.close()

    return out_file

# -------------------------------------------------------------------------
# Example usage
# -------------------------------------------------------------------------
if __name__ == "__main__":
    import asyncio
    SPEC = {
  "source": {
    "name": "samples",
    "source": "https://neural-science.s3.us-east-1.amazonaws.com/example_samples.csv"
  },
  "transformation": [
    {
      "groupby": [
        "organ",
        "organ_condition"
      ]
    },
    {
      "rollup": {
        "count": {
          "op": "count"
        }
      }
    }
  ],
  "representation": {
    "mark": "bar",
    "mapping": [
      {
        "encoding": "x",
        "field": "count",
        "type": "quantitative"
      },
      {
        "encoding": "y",
        "field": "organ",
        "type": "nominal"
      },
      {
        "encoding": "color",
        "field": "organ_condition",
        "type": "nominal"
      }
    ]
  }
}


    print("PNG written to:", asyncio.run(udi_to_png(SPEC, "donors12.png", headless=False)))