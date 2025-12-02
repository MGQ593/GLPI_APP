// src/app/api/glpi/document/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';

const GLPI_URL = process.env.GLPI_REST_API_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const sessionToken = request.headers.get('X-Session-Token');
    if (!sessionToken) {
      return NextResponse.json({ error: 'Session token requerido' }, { status: 401 });
    }

    if (!GLPI_URL || !APP_TOKEN) {
      console.error('Variables de entorno no configuradas');
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const ticketId = formData.get('ticketId') as string;
    const usersId = formData.get('users_id') as string;

    if (!file) {
      return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 });
    }

    // Convertir File a Buffer para enviar a GLPI
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Crear FormData para GLPI con el formato correcto
    const glpiFormData = new FormData();

    // El uploadManifest debe incluir el itemtype y items_id para vincular directamente
    // Nota: users_id no se incluye en el manifest ya que GLPI no lo soporta para uploads
    const uploadManifest = {
      input: {
        name: file.name,
        _filename: [file.name],
        itemtype: 'Ticket',
        items_id: ticketId ? parseInt(ticketId) : undefined,
      },
    };

    console.log(`User ID para documento: ${usersId || 'no especificado'}`);

    glpiFormData.append('uploadManifest', JSON.stringify(uploadManifest));

    // Crear un Blob desde el buffer
    const blob = new Blob([buffer], { type: file.type });
    glpiFormData.append('filename[0]', blob, file.name);

    console.log(`Subiendo documento a GLPI: ${file.name} (${file.size} bytes)`);
    console.log(`URL de subida: ${GLPI_URL}/Document`);
    console.log(`Manifest: ${JSON.stringify(uploadManifest)}`);

    // Subir documento a GLPI
    const uploadResponse = await fetch(`${GLPI_URL}/Document`, {
      method: 'POST',
      headers: {
        'App-Token': APP_TOKEN,
        'Session-Token': sessionToken,
      },
      body: glpiFormData,
    });

    const responseText = await uploadResponse.text();
    console.log(`Respuesta GLPI Upload: ${uploadResponse.status} ${responseText}`);

    if (!uploadResponse.ok) {
      console.error('Error subiendo documento:', responseText);
      return NextResponse.json({
        error: 'Error al subir documento',
        details: responseText
      }, { status: uploadResponse.status });
    }

    let uploadResult;
    try {
      uploadResult = JSON.parse(responseText);
    } catch {
      console.error('Error parseando respuesta:', responseText);
      return NextResponse.json({ error: 'Respuesta inválida de GLPI' }, { status: 500 });
    }

    // GLPI puede devolver el resultado en diferentes formatos
    const documentId = uploadResult.id || (Array.isArray(uploadResult) && uploadResult[0]?.id);

    if (!documentId) {
      console.error('No se obtuvo ID de documento:', uploadResult);
      return NextResponse.json({ error: 'No se pudo obtener ID del documento' }, { status: 500 });
    }

    console.log(`Documento subido con ID: ${documentId}`);

    // Actualizar el documento para asignar el users_id correcto
    if (usersId) {
      console.log(`Actualizando documento ${documentId} con users_id: ${usersId}`);
      const updateResponse = await fetch(`${GLPI_URL}/Document/${documentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': APP_TOKEN,
          'Session-Token': sessionToken,
        },
        body: JSON.stringify({
          input: {
            users_id: parseInt(usersId),
          },
        }),
      });

      if (!updateResponse.ok) {
        const updateError = await updateResponse.text();
        console.error('Error actualizando users_id del documento:', updateError);
        // No fallamos, el documento ya se subió
      } else {
        console.log(`Documento ${documentId} actualizado con users_id: ${usersId}`);
      }
    }

    // Si el documento se subió pero no se vinculó automáticamente, vincular manualmente
    if (ticketId && !uploadManifest.input.items_id) {
      const linkResponse = await fetch(`${GLPI_URL}/Document_Item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'App-Token': APP_TOKEN,
          'Session-Token': sessionToken,
        },
        body: JSON.stringify({
          input: {
            documents_id: documentId,
            itemtype: 'Ticket',
            items_id: parseInt(ticketId),
          },
        }),
      });

      if (!linkResponse.ok) {
        const linkError = await linkResponse.text();
        console.error('Error vinculando documento al ticket:', linkError);
        // No fallamos completamente, el documento ya se subió
      } else {
        console.log(`Documento ${documentId} vinculado al ticket ${ticketId}`);
      }
    }

    return NextResponse.json({
      success: true,
      documentId,
      fileName: file.name,
    });
  } catch (error) {
    console.error('Error en upload:', error);
    return NextResponse.json({ error: 'Error interno', details: String(error) }, { status: 500 });
  }
}
