// src/app/api/ticket/create/route.ts
// API que envía los datos del ticket al webhook de n8n para categorización automática
import { NextRequest, NextResponse } from 'next/server';

// URL del webhook de n8n para crear tickets
const N8N_WEBHOOK_URL = process.env.N8N_CREATE_TICKET_WEBHOOK_URL || 'https://chevyplan.app.n8n.cloud/webhook/60dcd1eb-2d5e-44d8-a704-a423ef7ba634';

interface AttachedFile {
  name: string;
  type: string;
  size: number;
  base64: string;
}

interface CreateTicketRequest {
  subject: string;
  description: string;
  userId: number;
  userEmail: string;
  userName: string;
  userTitle: string; // Título/Cargo del usuario (ej: "Analista de Operaciones")
  userPhone: string; // Teléfono/Celular del usuario
  sessionToken: string;
  attachments?: AttachedFile[];
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateTicketRequest = await request.json();

    // Validar campos requeridos
    if (!body.subject || !body.subject.trim()) {
      return NextResponse.json(
        { error: 'El asunto es requerido' },
        { status: 400 }
      );
    }

    if (!body.description || !body.description.trim()) {
      return NextResponse.json(
        { error: 'La descripción es requerida' },
        { status: 400 }
      );
    }

    if (!body.userId) {
      return NextResponse.json(
        { error: 'El ID de usuario es requerido' },
        { status: 400 }
      );
    }

    if (!body.sessionToken) {
      return NextResponse.json(
        { error: 'El token de sesión es requerido' },
        { status: 400 }
      );
    }

    console.log('[Create Ticket] Enviando al webhook n8n:', {
      subject: body.subject,
      userId: body.userId,
      userEmail: body.userEmail,
      userTitle: body.userTitle,
      userPhone: body.userPhone,
      attachmentsCount: body.attachments?.length || 0,
    });

    // Preparar el payload para n8n
    const n8nPayload = {
      subject: body.subject.trim(),
      description: body.description.trim(),
      userId: body.userId,
      userEmail: body.userEmail,
      userName: body.userName,
      userTitle: body.userTitle || '', // Título/Cargo del usuario
      userPhone: body.userPhone || '', // Teléfono/Celular del usuario
      sessionToken: body.sessionToken,
      attachments: body.attachments || [],
      createdAt: new Date().toISOString(),
    };

    console.log('[Create Ticket] URL del webhook:', N8N_WEBHOOK_URL);
    console.log('[Create Ticket] Payload a enviar:', JSON.stringify(n8nPayload, null, 2));

    // Enviar al webhook de n8n
    let n8nResponse;
    try {
      n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(n8nPayload),
      });
    } catch (fetchError) {
      console.error('[Create Ticket] Error de conexión a n8n:', fetchError);
      return NextResponse.json(
        { error: 'No se pudo conectar con el servidor de procesamiento', details: String(fetchError) },
        { status: 503 }
      );
    }

    console.log('[Create Ticket] Respuesta n8n - Status:', n8nResponse.status);

    // n8n puede devolver diferentes respuestas según su configuración
    // Si está configurado para "Respond Immediately", puede no devolver un body
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('[Create Ticket] Error de n8n:', n8nResponse.status, errorText);
      return NextResponse.json(
        { error: `Error al procesar el ticket (${n8nResponse.status})`, details: errorText || 'Sin detalles' },
        { status: 500 }
      );
    }

    // Intentar parsear la respuesta de n8n
    let n8nResult;
    const responseText = await n8nResponse.text();
    if (responseText) {
      try {
        n8nResult = JSON.parse(responseText);
      } catch {
        // Si no es JSON, usar el texto como mensaje
        n8nResult = { message: responseText };
      }
    }

    console.log('[Create Ticket] Respuesta de n8n:', n8nResult);

    return NextResponse.json({
      success: true,
      message: 'Ticket enviado correctamente para procesamiento',
      n8nResponse: n8nResult,
    });

  } catch (error) {
    console.error('[Create Ticket] Error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
