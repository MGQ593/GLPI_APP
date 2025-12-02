import { NextRequest, NextResponse } from 'next/server';

// GET - Proxy para obtener documentos/imágenes de GLPI
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const documentId = params.id;
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('session_token');

    if (!documentId) {
      return NextResponse.json(
        { error: 'El ID del documento es requerido' },
        { status: 400 }
      );
    }

    if (!sessionToken) {
      return NextResponse.json(
        { error: 'El session_token es requerido' },
        { status: 400 }
      );
    }

    const apiUrl = process.env.GLPI_REST_API_URL;
    const appToken = process.env.GLPI_APP_TOKEN;

    if (!apiUrl || !appToken) {
      console.error('Variables de entorno de GLPI REST API no configuradas');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // Primero obtener info del documento para saber su tipo MIME
    const documentInfoUrl = `${apiUrl}/Document/${documentId}`;
    console.log('Obteniendo info del documento:', documentInfoUrl);

    const infoResponse = await fetch(documentInfoUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'App-Token': appToken,
        'Session-Token': sessionToken,
      },
    });

    if (!infoResponse.ok) {
      console.error('Error obteniendo info documento:', infoResponse.status);
      return NextResponse.json(
        { error: 'Error al obtener documento' },
        { status: infoResponse.status }
      );
    }

    const docInfo = await infoResponse.json();
    const mimeType = docInfo.mime || 'application/octet-stream';
    console.log('Documento info:', { id: documentId, mime: mimeType, filename: docInfo.filename });

    // Descargar el documento usando el endpoint de la API REST
    // El endpoint correcto es: GET /Document/:id con header Accept: application/octet-stream
    const downloadUrl = `${apiUrl}/Document/${documentId}`;
    console.log('Descargando documento:', downloadUrl);

    const downloadResponse = await fetch(downloadUrl, {
      method: 'GET',
      headers: {
        'App-Token': appToken,
        'Session-Token': sessionToken,
        'Accept': 'application/octet-stream',
      },
    });

    if (!downloadResponse.ok) {
      console.error('Error descargando documento:', downloadResponse.status);
      return NextResponse.json(
        { error: 'No se pudo descargar el documento' },
        { status: downloadResponse.status }
      );
    }

    const contentType = downloadResponse.headers.get('content-type') || mimeType;
    const buffer = await downloadResponse.arrayBuffer();

    // Si el buffer está vacío o es muy pequeño, puede ser un error
    if (buffer.byteLength < 10) {
      console.error('Documento vacío o muy pequeño:', buffer.byteLength);
      return NextResponse.json(
        { error: 'Documento vacío' },
        { status: 404 }
      );
    }

    // Determinar si es una descarga o visualización
    const download = searchParams.get('download') === 'true';
    const filename = docInfo.filename || `document_${documentId}`;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    };

    if (download) {
      headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(filename)}"`;
    }

    return new NextResponse(buffer, { headers });

  } catch (error) {
    console.error('Error en proxy de documento:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
