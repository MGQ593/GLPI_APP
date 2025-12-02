// src/app/api/satisfaction/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne, execute } from '@/lib/db';

type SatisfactionStatus = 'draft' | 'pending' | 'completed';

interface SatisfactionRecord {
  id: number;
  glpi_ticket_id: number;
  glpi_user_id: number;
  user_email: string;
  user_name: string | null;
  ticket_subject: string | null;
  ticket_closed_date: Date | null;
  satisfaction: number | null;
  comment: string | null;
  status?: SatisfactionStatus; // Opcional para retrocompatibilidad
  created_at: Date;
  updated_at: Date;
}

// Variable para cachear si la columna status existe
let hasStatusColumn: boolean | null = null;

// Función para verificar si la columna status existe
async function checkStatusColumnExists(): Promise<boolean> {
  if (hasStatusColumn !== null) return hasStatusColumn;

  try {
    // Buscar en information_schema del schema ticket_portal
    const result = await queryOne<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'ticket_portal'
       AND table_name = 'ticket_satisfaction'
       AND column_name = 'status'`
    );
    hasStatusColumn = result !== null;
    console.log(`[Satisfaction API] Columna 'status' existe (info_schema): ${hasStatusColumn}`);
    return hasStatusColumn;
  } catch (e) {
    console.log(`[Satisfaction API] Error verificando columna status via info_schema:`, e);
  }

  // Alternativa: intentar una query simple
  try {
    await query('SELECT status FROM ticket_satisfaction LIMIT 1');
    hasStatusColumn = true;
  } catch {
    hasStatusColumn = false;
  }

  console.log(`[Satisfaction API] Columna 'status' existe (query directa): ${hasStatusColumn}`);
  return hasStatusColumn;
}

// GET - Obtener encuestas por ticket_id o user_id
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticketId = searchParams.get('ticket_id');
    const userId = searchParams.get('user_id');
    const email = searchParams.get('email');
    const status = searchParams.get('status') as SatisfactionStatus | null;

    if (ticketId) {
      // Obtener encuesta de un ticket específico
      const satisfaction = await queryOne<SatisfactionRecord>(
        'SELECT * FROM ticket_satisfaction WHERE glpi_ticket_id = $1',
        [parseInt(ticketId)]
      );

      return NextResponse.json(satisfaction);
    }

    if (userId) {
      // Obtener todas las encuestas de un usuario (opcionalmente filtradas por status)
      const satisfactions = status
        ? await query<SatisfactionRecord>(
            'SELECT * FROM ticket_satisfaction WHERE glpi_user_id = $1 AND status = $2 ORDER BY created_at DESC',
            [parseInt(userId), status]
          )
        : await query<SatisfactionRecord>(
            'SELECT * FROM ticket_satisfaction WHERE glpi_user_id = $1 ORDER BY created_at DESC',
            [parseInt(userId)]
          );

      return NextResponse.json(satisfactions);
    }

    if (email) {
      // Obtener todas las encuestas por email (opcionalmente filtradas por status)
      const satisfactions = status
        ? await query<SatisfactionRecord>(
            'SELECT * FROM ticket_satisfaction WHERE user_email = $1 AND status = $2 ORDER BY created_at DESC',
            [email.toLowerCase(), status]
          )
        : await query<SatisfactionRecord>(
            'SELECT * FROM ticket_satisfaction WHERE user_email = $1 ORDER BY created_at DESC',
            [email.toLowerCase()]
          );

      return NextResponse.json(satisfactions);
    }

    return NextResponse.json(
      { error: 'Se requiere ticket_id, user_id o email' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error en GET /api/satisfaction:', error);
    return NextResponse.json(
      { error: 'Error interno', details: String(error) },
      { status: 500 }
    );
  }
}

// POST - Crear nueva encuesta (draft por defecto)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      glpi_ticket_id,
      glpi_user_id,
      user_email,
      user_name,
      ticket_subject,
      ticket_closed_date,
      satisfaction,
      comment,
      status = 'draft', // Por defecto es draft cuando se crea el ticket
    } = body;

    // Validaciones
    if (!glpi_ticket_id || !glpi_user_id || !user_email) {
      return NextResponse.json(
        { error: 'Se requieren: glpi_ticket_id, glpi_user_id, user_email' },
        { status: 400 }
      );
    }

    // Validar status
    if (!['draft', 'pending', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'status debe ser: draft, pending o completed' },
        { status: 400 }
      );
    }

    // satisfaction puede ser null (draft/pending) o un número entre 1 y 5 (completed)
    if (satisfaction !== null && satisfaction !== undefined && (satisfaction < 1 || satisfaction > 5)) {
      return NextResponse.json(
        { error: 'satisfaction debe ser null o un número entre 1 y 5' },
        { status: 400 }
      );
    }

    // Si hay satisfaction, el status debe ser completed
    const finalStatus: SatisfactionStatus = satisfaction ? 'completed' : (status as SatisfactionStatus);

    // Verificar si ya existe una encuesta para este ticket/usuario
    const existing = await queryOne<SatisfactionRecord>(
      'SELECT id FROM ticket_satisfaction WHERE glpi_ticket_id = $1 AND glpi_user_id = $2',
      [glpi_ticket_id, glpi_user_id]
    );

    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe una encuesta para este ticket', existingId: existing.id },
        { status: 409 }
      );
    }

    // Verificar si la columna status existe
    const statusExists = await checkStatusColumnExists();

    // Insertar nueva encuesta (con o sin status según la estructura de la tabla)
    let result;
    if (statusExists) {
      result = await query<SatisfactionRecord>(
        `INSERT INTO ticket_satisfaction (
          glpi_ticket_id,
          glpi_user_id,
          user_email,
          user_name,
          ticket_subject,
          ticket_closed_date,
          satisfaction,
          comment,
          status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          glpi_ticket_id,
          glpi_user_id,
          user_email.toLowerCase(),
          user_name || null,
          ticket_subject || null,
          ticket_closed_date || null,
          satisfaction || null,
          comment || null,
          finalStatus,
        ]
      );

      const statusMessages: Record<SatisfactionStatus, string> = {
        draft: `[Satisfaction] Encuesta borrador creada: Ticket ${glpi_ticket_id}, Usuario ${glpi_user_id}`,
        pending: `[Satisfaction] Encuesta pendiente creada: Ticket ${glpi_ticket_id}, Usuario ${glpi_user_id}`,
        completed: `[Satisfaction] Calificación guardada: Ticket ${glpi_ticket_id}, Usuario ${glpi_user_id}, Rating ${satisfaction}`,
      };
      console.log(statusMessages[finalStatus]);
    } else {
      // Versión legacy sin columna status
      result = await query<SatisfactionRecord>(
        `INSERT INTO ticket_satisfaction (
          glpi_ticket_id,
          glpi_user_id,
          user_email,
          user_name,
          ticket_subject,
          ticket_closed_date,
          satisfaction,
          comment
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          glpi_ticket_id,
          glpi_user_id,
          user_email.toLowerCase(),
          user_name || null,
          ticket_subject || null,
          ticket_closed_date || null,
          satisfaction || null,
          comment || null,
        ]
      );
      console.log(`[Satisfaction] Encuesta creada (legacy): Ticket ${glpi_ticket_id}, Usuario ${glpi_user_id}`);
    }

    return NextResponse.json({
      success: true,
      satisfaction: result[0],
    }, { status: 201 });

  } catch (error) {
    console.error('Error en POST /api/satisfaction:', error);
    return NextResponse.json(
      { error: 'Error interno', details: String(error) },
      { status: 500 }
    );
  }
}

// PUT - Actualizar encuesta existente (calificar o cambiar status)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, glpi_ticket_id, glpi_user_id, satisfaction, comment, status } = body;

    // Necesitamos id o (glpi_ticket_id + glpi_user_id)
    if (!id && (!glpi_ticket_id || !glpi_user_id)) {
      return NextResponse.json(
        { error: 'Se requiere id o (glpi_ticket_id + glpi_user_id)' },
        { status: 400 }
      );
    }

    // Si se proporciona satisfaction, debe ser válido
    if (satisfaction !== undefined && satisfaction !== null && (satisfaction < 1 || satisfaction > 5)) {
      return NextResponse.json(
        { error: 'satisfaction debe ser un número entre 1 y 5' },
        { status: 400 }
      );
    }

    // Si se proporciona status, debe ser válido
    if (status && !['draft', 'pending', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'status debe ser: draft, pending o completed' },
        { status: 400 }
      );
    }

    // Determinar el status final
    let finalStatus = status;
    if (satisfaction && satisfaction >= 1 && satisfaction <= 5) {
      finalStatus = 'completed'; // Si hay calificación, siempre es completed
    }

    // Verificar si la columna status existe
    const statusExists = await checkStatusColumnExists();

    let result;

    if (id) {
      if (finalStatus && statusExists) {
        result = await execute(
          `UPDATE ticket_satisfaction
           SET satisfaction = COALESCE($1, satisfaction), comment = $2, status = $3, updated_at = NOW()
           WHERE id = $4`,
          [satisfaction || null, comment || null, finalStatus, id]
        );
      } else {
        result = await execute(
          `UPDATE ticket_satisfaction
           SET satisfaction = $1, comment = $2, updated_at = NOW()
           WHERE id = $3`,
          [satisfaction, comment || null, id]
        );
      }
    } else {
      if (finalStatus && statusExists) {
        result = await execute(
          `UPDATE ticket_satisfaction
           SET satisfaction = COALESCE($1, satisfaction), comment = $2, status = $3, updated_at = NOW()
           WHERE glpi_ticket_id = $4 AND glpi_user_id = $5`,
          [satisfaction || null, comment || null, finalStatus, glpi_ticket_id, glpi_user_id]
        );
      } else {
        result = await execute(
          `UPDATE ticket_satisfaction
           SET satisfaction = $1, comment = $2, updated_at = NOW()
           WHERE glpi_ticket_id = $3 AND glpi_user_id = $4`,
          [satisfaction, comment || null, glpi_ticket_id, glpi_user_id]
        );
      }
    }

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: 'No se encontró la encuesta para actualizar' },
        { status: 404 }
      );
    }

    const logMessage = satisfaction
      ? `[Satisfaction] Calificación actualizada: Ticket ${glpi_ticket_id || id}, Rating ${satisfaction}`
      : `[Satisfaction] Status actualizado a '${finalStatus}': Ticket ${glpi_ticket_id || id}`;
    console.log(logMessage);

    return NextResponse.json({ success: true, updated: result.rowCount });

  } catch (error) {
    console.error('Error en PUT /api/satisfaction:', error);
    return NextResponse.json(
      { error: 'Error interno', details: String(error) },
      { status: 500 }
    );
  }
}
