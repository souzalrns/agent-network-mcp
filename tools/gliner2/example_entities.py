"""Exemplo testado e confirmado a funcionar em 09/08/2026."""
from gliner2 import GLiNER2

model = GLiNER2.from_pretrained("fastino/gliner2-base-v1")

texto = "Kathia Vianna é advogada na ViannaLegal, especialista em cidadania portuguesa. O escritório fica em Portugal."

resultado = model.extract_entities(texto, ["pessoa", "profissão", "empresa", "país"])
print("Entidades:", resultado)
