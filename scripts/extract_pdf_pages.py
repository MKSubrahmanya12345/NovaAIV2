from pypdf import PdfReader

pdf_path = r"C:\Users\User\Downloads\Athernex Participant PPT.pdf"
reader = PdfReader(pdf_path)
print(f"pages {len(reader.pages)}")
for i, page in enumerate(reader.pages, 1):
    text = (page.extract_text() or "").replace("\n", " ").strip()
    print(f"---PAGE {i}---")
    print(text[:1000] if text else "[NO_TEXT]")
