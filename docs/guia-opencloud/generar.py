#!/usr/bin/env python3
"""Genera la guía de uso de OpenCloud para el equipo de Bertika."""
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

NAVY = RGBColor(0x0A, 0x17, 0x40)
ORANGE = RGBColor(0xE0, 0x6A, 0x00)
GRAY = RGBColor(0x5A, 0x63, 0x73)
TEXT = RGBColor(0x1F, 0x27, 0x33)

BASE = Path(__file__).resolve().parent
RAIZ = BASE.parent.parent
IMAGEN = RAIZ / 'docs' / 'img' / 'opencloud-editor.png'
SALIDA = BASE / 'Guia-OpenCloud-para-el-equipo.docx'


def sombrear(celda, hex_color):
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    celda._tc.get_or_add_tcPr().append(shd)


def borde_inferior(parrafo, color='E06A00', tamano='12'):
    pPr = parrafo._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), tamano)
    bottom.set(qn('w:space'), '4')
    bottom.set(qn('w:color'), color)
    pbdr.append(bottom)
    pPr.append(pbdr)


def numeracion_pagina(parrafo):
    run = parrafo.add_run()
    inicio = OxmlElement('w:fldChar')
    inicio.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = 'PAGE'
    fin = OxmlElement('w:fldChar')
    fin.set(qn('w:fldCharType'), 'end')
    run._r.append(inicio)
    run._r.append(instr)
    run._r.append(fin)


doc = Document()

# ---------- Estilos base ----------
normal = doc.styles['Normal']
normal.font.name = 'Calibri'
normal.font.size = Pt(10.5)
normal.font.color.rgb = TEXT
normal.paragraph_format.space_after = Pt(6)
normal.paragraph_format.line_spacing = 1.12

for nombre, tamano in (('Heading 1', 15), ('Heading 2', 12), ('Heading 3', 11)):
    estilo = doc.styles[nombre]
    estilo.font.name = 'Calibri'
    estilo.font.size = Pt(tamano)
    estilo.font.bold = True
    estilo.font.color.rgb = NAVY
    estilo.paragraph_format.space_before = Pt(14 if nombre == 'Heading 1' else 10)
    estilo.paragraph_format.space_after = Pt(4)

# ---------- Página ----------
seccion = doc.sections[0]
seccion.page_width = Cm(21)
seccion.page_height = Cm(29.7)
seccion.top_margin = Cm(2)
seccion.bottom_margin = Cm(2)
seccion.left_margin = Cm(2.2)
seccion.right_margin = Cm(2.2)

# Pie de página
pie = seccion.footer.paragraphs[0]
pie.text = 'BERTIKA® · OpenCloud · Guía de uso interno · '
pie.alignment = WD_ALIGN_PARAGRAPH.CENTER
for run in pie.runs:
    run.font.size = Pt(8.5)
    run.font.color.rgb = GRAY
numeracion_pagina(pie)
for run in pie.runs:
    run.font.size = Pt(8.5)
    run.font.color.rgb = GRAY

# ---------- Portada ----------
titulo = doc.add_paragraph()
titulo.paragraph_format.space_before = Pt(40)
run = titulo.add_run('OpenCloud')
run.font.size = Pt(34)
run.font.bold = True
run.font.color.rgb = NAVY

sub = doc.add_paragraph()
run = sub.add_run('Guía de uso para el equipo')
run.font.size = Pt(18)
run.font.color.rgb = ORANGE
run.font.bold = True
borde_inferior(sub, 'FFB020', '18')

intro = doc.add_paragraph()
intro.paragraph_format.space_before = Pt(10)
run = intro.add_run('BERTIKA® · Acumuladores Industriales')
run.font.size = Pt(11)
run.font.color.rgb = GRAY

doc.add_paragraph()
datos = doc.add_table(rows=3, cols=2)
datos.style = 'Table Grid'
datos.alignment = WD_TABLE_ALIGNMENT.LEFT
filas = [
    ('Dirección', 'https://nube.bertika.com'),
    ('Tu usuario', 'tu nombre. Ejemplo: marcos'),
    ('Tu clave inicial', 'te la entrega el administrador en un archivo aparte'),
]
for i, (k, v) in enumerate(filas):
    datos.rows[i].cells[0].text = k
    datos.rows[i].cells[1].text = v
    for parrafo in datos.rows[i].cells[0].paragraphs:
        for r in parrafo.runs:
            r.font.bold = True
            r.font.color.rgb = NAVY
    sombrear(datos.rows[i].cells[0], 'F2F4F8')
for fila in datos.rows:
    fila.cells[0].width = Cm(4.2)
    fila.cells[1].width = Cm(12.2)

aviso = doc.add_paragraph()
aviso.paragraph_format.space_before = Pt(14)
run = aviso.add_run('Cambiá la clave en tu primer ingreso. No la compartas por WhatsApp ni por correo.')
run.font.size = Pt(10)
run.font.bold = True
run.font.color.rgb = ORANGE

doc.add_page_break()

# ---------- 1. Qué es ----------
doc.add_heading('1. Qué es OpenCloud y para qué lo usamos', level=1)
doc.add_paragraph(
    'OpenCloud es la nube de archivos de Bertika. Ahí viven los documentos de la empresa: '
    'presupuestos, remitos, facturas, garantías, manuales, fotos de equipos y planillas. '
    'Se usa desde el navegador, desde la computadora y desde el celular, y se puede editar '
    'Word, Excel y PowerPoint sin instalar Office.'
)
p = doc.add_paragraph()
run = p.add_run('La regla de oro: ')
run.font.bold = True
p.add_run(
    'si un archivo es de la empresa, va a OpenCloud. No al WhatsApp, no al pendrive, '
    'no a un Drive personal y no al escritorio de una computadora.'
)

# ---------- 2. Entrar ----------
doc.add_heading('2. Cómo entrar la primera vez', level=1)
pasos = [
    ('Abrí el navegador', 'andá a https://nube.bertika.com. Funciona en cualquier navegador y en cualquier dispositivo.'),
    ('Ingresá tu usuario', 'es tu nombre, sin arroba: marcos, juan, veronica o delfina. También podés usar tu correo completo.'),
    ('Ingresá tu clave inicial', 'es la que te entregó el administrador. Si no la tenés, pedísela.'),
    ('Cambiala', 'arriba a la derecha, clic en tu nombre → Configuración → Seguridad → Cambiar contraseña.'),
]
for i, (titulo_paso, detalle) in enumerate(pasos, start=1):
    parrafo = doc.add_paragraph()
    parrafo.paragraph_format.left_indent = Cm(0.75)
    parrafo.paragraph_format.first_line_indent = Cm(-0.5)
    run = parrafo.add_run(f'{i}. ')
    run.font.bold = True
    run = parrafo.add_run(f'{titulo_paso}: ')
    run.font.bold = True
    parrafo.add_run(detalle)

# ---------- 3. Pantalla ----------
doc.add_heading('3. La pantalla principal', level=1)
doc.add_paragraph('A la izquierda está el menú. Estas son las secciones que vas a usar:')
secciones = [
    ('Todos los archivos', 'todo lo que tenés disponible.'),
    ('Personal', 'tu espacio personal, para borradores y cosas tuyas. No es para archivos de la empresa.'),
    ('Espacios', 'los espacios de las áreas (Ventas, Taller, Administración, Cobranzas). Ahí va lo de la empresa.'),
    ('Compartidos', 'lo que otras personas compartieron con vos.'),
    ('Archivos eliminados', 'la papelera. Si borraste algo por error, se recupera desde acá.'),
]
for nombre, detalle in secciones:
    parrafo = doc.add_paragraph(style='List Bullet')
    run = parrafo.add_run(f'{nombre}: ')
    run.font.bold = True
    parrafo.add_run(detalle)

p = doc.add_paragraph()
run = p.add_run('Arriba a la derecha están el buscador y el botón «Nuevo». ')
run.font.bold = True
p.add_run('Con «Nuevo» se suben archivos, se crean carpetas y se crean documentos nuevos.')

# ---------- 4. Subir y descargar ----------
doc.add_heading('4. Subir y descargar archivos', level=1)
doc.add_heading('Subir desde la computadora', level=2)
doc.add_paragraph(
    'Entrá al espacio o la carpeta donde corresponde, tocá «Nuevo» y elegí «Files Upload» '
    '(subir archivos) o «Folder Upload» (subir una carpeta completa). También podés arrastrar '
    'los archivos desde el Explorador o el Finder y soltarlos en la ventana.'
)
doc.add_heading('Descargar o abrir', level=2)
doc.add_paragraph(
    'Hacé clic en el archivo. Si es un documento de Office, se abre directamente en el navegador '
    'para editarlo. Si es una foto, un PDF o un video, se abre una vista previa; desde el menú de '
    'los tres puntos podés descargarlo.'
)
p = doc.add_paragraph()
run = p.add_run('Cómo nombrar los archivos. ')
run.font.bold = True
p.add_run(
    'Usá un nombre que se entienda sin abrirlo: fecha, cliente y tema. '
    'Ejemplo: 2026-10-24 Cliente YPF - presupuesto batería tracción. Evitá «documento1», «final» y «final final».'
)

# ---------- 5. Editar ----------
doc.add_heading('5. Editar documentos sin instalar Office', level=1)
doc.add_paragraph(
    'OpenCloud incluye un editor en el navegador (Collabora). Al hacer clic en un archivo .docx, '
    '.xlsx, .pptx, .odt u .ods, se abre como si fuera Word o Excel, con la barra de herramientas arriba.'
)
doc.add_paragraph(
    'Varias personas pueden editar el mismo documento a la vez y ver los cambios en vivo. '
    'Se guarda solo. Al cerrar, no hace falta subir nada: el archivo queda actualizado en el servidor.'
)

if IMAGEN.exists():
    doc.add_picture(str(IMAGEN), width=Cm(16.2))
    leyenda = doc.add_paragraph()
    leyenda.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = leyenda.add_run('Un documento de Word abierto en el navegador, sin instalar Office.')
    run.font.size = Pt(8.5)
    run.font.color.rgb = GRAY
    run.font.italic = True

p = doc.add_paragraph()
run = p.add_run('Ojo: ')
run.font.bold = True
p.add_run(
    'si abren el mismo documento desde la carpeta sincronizada de la computadora (con el cliente de '
    'escritorio) en lugar del navegador, no se edita en vivo. Para trabajar entre varios, usen el navegador.'
)

# ---------- 6. Compartir ----------
doc.add_heading('6. Compartir archivos y carpetas', level=1)
doc.add_heading('Con alguien del equipo', level=2)
doc.add_paragraph(
    'Clic en el menú de los tres puntos del archivo o carpeta → «Compartir» → escribí el nombre o el '
    'grupo → elegí el permiso (ver o editar) → «Compartir». La otra persona lo va a ver en «Compartidos».'
)
doc.add_heading('Con alguien de afuera (cliente o proveedor)', level=2)
doc.add_paragraph(
    'Menú del archivo → «Compartir» → «Crear enlace». Ponele una contraseña y una fecha de vencimiento, '
    'copiá el enlace y mandalo. Cuando ya no haga falta, entrá al mismo menú y eliminalo: el enlace deja de funcionar.'
)
p = doc.add_paragraph()
run = p.add_run('Cuidado con los enlaces. ')
run.font.bold = True
p.add_run(
    'Un enlace sin contraseña lo puede abrir cualquiera que lo tenga. Para información de clientes, '
    'siempre con contraseña y vencimiento.'
)

# ---------- 7. Computadora ----------
doc.add_heading('7. En la computadora: carpeta sincronizada', level=1)
doc.add_paragraph(
    'El cliente de escritorio crea una carpeta en tu computadora que se mantiene igual a la nube. '
    'Lo que guardás ahí se sube solo; lo que sube otro, aparece en tu carpeta.'
)
doc.add_heading('Descargar e instalar', level=2)
apps = [
    ('Windows', 'Microsoft Store: https://apps.microsoft.com/detail/9pbx43hcmldq'),
    ('macOS', 'instalador .pkg: https://github.com/opencloud-eu/desktop/releases/latest'),
    ('Linux', 'AppImage: https://github.com/opencloud-eu/desktop/releases/latest'),
]
for sistema, enlace in apps:
    parrafo = doc.add_paragraph(style='List Bullet')
    run = parrafo.add_run(f'{sistema}: ')
    run.font.bold = True
    parrafo.add_run(enlace)

doc.add_heading('Configurarlo', level=2)
config = [
    'Abrí la aplicación y elegí «Agregar cuenta».',
    'Dirección del servidor: https://nube.bertika.com',
    'Usuario: tu nombre. Clave: la tuya.',
    'Elegí qué carpetas querés tener sincronizadas y dónde guardarlas en tu computadora.',
]
for i, texto in enumerate(config, start=1):
    parrafo = doc.add_paragraph()
    parrafo.paragraph_format.left_indent = Cm(0.75)
    parrafo.paragraph_format.first_line_indent = Cm(-0.5)
    run = parrafo.add_run(f'{i}. ')
    run.font.bold = True
    parrafo.add_run(texto)

p = doc.add_paragraph()
run = p.add_run('Los iconos te dicen cómo va: ')
run.font.bold = True
p.add_run('verde = todo sincronizado; azul = subiendo o bajando; rojo = hay un error (avisale al administrador).')
python_doc = doc.add_paragraph()
run = python_doc.add_run('Antes de apagar la computadora, esperá a que el icono esté verde.')
run.font.bold = True

# ---------- 8. Celular ----------
doc.add_heading('8. En el celular', level=1)
doc.add_paragraph('La aplicación oficial sirve para ver archivos, subir fotos y trabajar sin conexión.')
moviles = [
    ('iPhone / iPad', 'App Store: https://apps.apple.com/de/app/opencloud-your-data-anywhere/id6743121005'),
    ('Android', 'Play Store: https://play.google.com/store/apps/details?id=eu.opencloud.android'),
]
for sistema, enlace in moviles:
    parrafo = doc.add_paragraph(style='List Bullet')
    run = parrafo.add_run(f'{sistema}: ')
    run.font.bold = True
    parrafo.add_run(enlace)
doc.add_paragraph(
    'Al abrirla por primera vez, agregá la cuenta con la misma dirección (https://nube.bertika.com), '
    'tu usuario y tu clave. Desde el botón «+» podés subir fotos y archivos directamente a la carpeta '
    'del cliente o de la orden.'
)
p = doc.add_paragraph()
run = p.add_run('Si no encontrás la app, ')
run.font.bold = True
p.add_run('entrá desde el navegador del celular a https://nube.bertika.com: funciona igual.')

# ---------- 9. Reglas ----------
doc.add_heading('9. Reglas del equipo', level=1)
reglas = [
    'Lo de la empresa va en el espacio del área (Ventas, Taller, Administración, Cobranzas), no en Personal.',
    'No borres ni muevas archivos de otras personas. Si algo está mal ubicado, avisá.',
    'No guardes contraseñas, claves ni datos de tarjetas en archivos de la nube.',
    'Para compartir con clientes, usá enlaces con contraseña y vencimiento.',
    'No uses cuentas personales de Drive, WhatsApp o correo para documentos de Bertika.',
    'Cuando alguien deja la empresa, el administrador le quita el acceso: los archivos quedan en el espacio.',
]
for regla in reglas:
    doc.add_paragraph(regla, style='List Bullet')

# ---------- 10. Problemas ----------
doc.add_heading('10. Problemas frecuentes', level=1)
tabla = doc.add_table(rows=1, cols=2)
tabla.style = 'Table Grid'
encabezados = ['Qué te pasa', 'Qué hacer']
for i, texto in enumerate(encabezados):
    celda = tabla.rows[0].cells[i]
    celda.text = texto
    sombrear(celda, '0A1740')
    for parrafo in celda.paragraphs:
        for run in parrafo.runs:
            run.font.bold = True
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

problemas = [
    ('No me aparece el espacio de mi área',
     'Puede que todavía no estés en el grupo. Pedile al administrador que te agregue.'),
    ('Puedo ver pero no editar',
     'Tu permiso es de solo lectura. Pedí que te lo cambien a «editar».'),
    ('Me olvidé la clave',
     'El administrador te la restablece. El aviso automático por correo todavía no está activo en OpenCloud.'),
    ('La carpeta de la computadora no sincroniza',
     'Mirá el icono: si está rojo, revisá la conexión y el espacio libre en el disco. Si sigue, avisá.'),
    ('Aparece un archivo con «conflicto» en el nombre',
     'Dos personas editaron el mismo archivo sin conexión. Abrilo, compará con el original, quedate con la versión buena y borrá la otra.'),
    ('El archivo es muy pesado y no sube',
     'Usá el navegador o el cliente de escritorio. No lo mandes por correo ni por WhatsApp.'),
]
for problema, solucion in problemas:
    fila = tabla.add_row()
    fila.cells[0].text = problema
    fila.cells[1].text = solucion
    for parrafo in fila.cells[0].paragraphs:
        for run in parrafo.runs:
            run.font.bold = True
for fila in tabla.rows:
    fila.cells[0].width = Cm(6.2)
    fila.cells[1].width = Cm(10.4)

# ---------- 11. Ayuda ----------
doc.add_heading('11. A quién preguntar', level=1)
doc.add_paragraph(
    'Consultas, altas de usuarios, permisos y recuperación de claves: al administrador de OpenCloud de Bertika. '
    'No hace falta crear cuentas nuevas ni instalar nada más.'
)

# ---------- Chuleta ----------
doc.add_page_break()
doc.add_heading('Chuleta rápida', level=1)
chuleta = doc.add_table(rows=1, cols=2)
chuleta.style = 'Table Grid'
for i, texto in enumerate(['Quiero…', 'Cómo']):
    celda = chuleta.rows[0].cells[i]
    celda.text = texto
    sombrear(celda, '0A1740')
    for parrafo in celda.paragraphs:
        for run in parrafo.runs:
            run.font.bold = True
            run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

atajos = [
    ('Entrar', 'nube.bertika.com → usuario y clave'),
    ('Subir un archivo', 'botón «Nuevo» → Files Upload (o arrastrarlo)'),
    ('Editar Word o Excel', 'clic en el documento (se abre en el navegador)'),
    ('Compartir con un compañero', 'menú de tres puntos → Compartir → persona o grupo'),
    ('Compartir con un cliente', 'menú de tres puntos → Compartir → Crear enlace (con clave y vencimiento)'),
    ('Recuperar algo borrado', 'Archivos eliminados → restaurar'),
    ('Buscar', 'lupa arriba a la derecha: busca por nombre y por contenido'),
]
for accion, como in atajos:
    fila = chuleta.add_row()
    fila.cells[0].text = accion
    fila.cells[1].text = como
    for parrafo in fila.cells[0].paragraphs:
        for run in parrafo.runs:
            run.font.bold = True
for fila in chuleta.rows:
    fila.cells[0].width = Cm(6.2)
    fila.cells[1].width = Cm(10.4)

cierre = doc.add_paragraph()
cierre.paragraph_format.space_before = Pt(16)
run = cierre.add_run('Los archivos de Bertika son de Bertika: viven en el servidor de la empresa y se respaldan todas las noches.')
run.font.size = Pt(10.5)
run.font.bold = True
run.font.color.rgb = NAVY

doc.save(SALIDA)
print(f'generado: {SALIDA}')
