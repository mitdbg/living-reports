# write a python code to test if my openai api key is working

import openai
import os   
openai.api_key = os.getenv("OPENAI_API_KEY")

prompt = "return 5 records of cars"

response = openai.chat.completions.create(
                        model="gpt-4.1-mini",
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.7,
                    )

print(response)