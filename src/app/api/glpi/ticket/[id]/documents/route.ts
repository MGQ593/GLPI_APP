// src/app/api/glpi/ticket/[id]/documents/route.ts
import { NextRequest, NextResponse } from 'next/server';

const GLPI_URL = process.env.GLPI_REST_API_URL;
const APP_TOKEN = process.env.GLPI_APP_TOKEN;

interface DocumentItem {
  id: number;
  documents_id: number;
  date_creation?: string;
  users_id?: number;
  timeline_position?: number;
  itemtype?: string;
  items_id?: number;
}

interface DocumentResult {
  id: number;
  name: string;
  filename: string;
  filepath: string;
  mime: string;
  date_creation: string;
  users_id: number;
  filesize: number;
  timeline_position?: number;
  itemtype: string;
  items_id: number;
}

async function fetchDocumentDetails(
  docId: number,
  sessionToken: string,
  itemtype: string,
  itemsId: number,
  dateCreation?: string,
  usersId?: number,
  timelinePosition?: number
): Promise<DocumentResult | null> {
  try {
    const docResponse = await fetch(`${GLPI_URL}/Document/${docId}`, {
      headers: {
        'App-Token': APP_TOKEN!,
        'Session-Token': sessionToken,
      },
    });

    if (docResponse.ok) {
      const doc = await docResponse.json();
      // Log para debug del filesize
      console.log(`[Documents] Doc ${docId} raw data:`, JSON.stringify({
        id: doc.id,
        filename: doc.filename,
        filesize: doc.filesize,
        sha1sum: doc.sha1sum,
        size: doc.size,
      }));
      return {
        id: doc.id,
        name: doc.name,
        filename: doc.filename,
        filepath: doc.filepath,
        mime: doc.mime,
        date_creation: dateCreation || doc.date_creation,
        users_id: usersId || doc.users_id,
        filesize: doc.filesize || doc.size || 0,
        timeline_position: timelinePosition,
        itemtype: itemtype,
        items_id: itemsId,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error obteniendo documento ${docId}:`, error);
    return null;
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionToken = request.headers.get('X-Session-Token');
    if (!sessionToken) {
      return NextResponse.json({ error: 'Session token requerido' }, { status: 401 });
    }

    if (!GLPI_URL || !APP_TOKEN) {
      console.error('Variables de entorno no configuradas');
      return NextResponse.json({ error: 'Error de configuración' }, { status: 500 });
    }

    const ticketId = params.id;
    const allDocuments: DocumentResult[] = [];

    // 1. Obtener Document_Item del ticket directamente
    const ticketDocsResponse = await fetch(`${GLPI_URL}/Ticket/${ticketId}/Document_Item`, {
      headers: {
        'App-Token': APP_TOKEN,
        'Session-Token': sessionToken,
      },
    });

    if (ticketDocsResponse.ok) {
      const ticketDocs: DocumentItem[] = await ticketDocsResponse.json();
      if (Array.isArray(ticketDocs)) {
        // Filtrar solo documentos con timeline_position >= 1
        const realTicketDocs = ticketDocs.filter(item =>
          item.timeline_position !== undefined && item.timeline_position >= 1
        );

        for (const item of realTicketDocs) {
          const doc = await fetchDocumentDetails(
            item.documents_id,
            sessionToken,
            'Ticket',
            Number(ticketId),
            item.date_creation,
            item.users_id,
            item.timeline_position
          );
          if (doc) allDocuments.push(doc);
        }
      }
    }

    // 2. Obtener followups del ticket para buscar documentos adjuntos a cada uno
    const followupsResponse = await fetch(`${GLPI_URL}/Ticket/${ticketId}/ITILFollowup`, {
      headers: {
        'App-Token': APP_TOKEN,
        'Session-Token': sessionToken,
      },
    });

    if (followupsResponse.ok) {
      const followups = await followupsResponse.json();
      if (Array.isArray(followups)) {
        // Para cada followup, buscar documentos asociados
        for (const followup of followups) {
          const followupId = followup.id;

          // Buscar Document_Item donde itemtype=ITILFollowup y items_id=followupId
          // GLPI guarda esto en la tabla Document_Item global
          const followupDocsResponse = await fetch(
            `${GLPI_URL}/Document_Item?searchText[itemtype]=ITILFollowup&searchText[items_id]=${followupId}`,
            {
              headers: {
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
              },
            }
          );

          if (followupDocsResponse.ok) {
            const followupDocs: DocumentItem[] = await followupDocsResponse.json();
            if (Array.isArray(followupDocs)) {
              console.log(`[Documents] Followup ${followupId} tiene ${followupDocs.length} documentos`);
              for (const item of followupDocs) {
                const doc = await fetchDocumentDetails(
                  item.documents_id,
                  sessionToken,
                  'ITILFollowup',
                  followupId,
                  item.date_creation,
                  item.users_id,
                  item.timeline_position
                );
                if (doc) {
                  // Permitir el mismo documento en diferentes followups
                  // Solo evitar duplicados exactos (mismo doc ID Y mismo itemtype:items_id)
                  if (!allDocuments.some(d => d.id === doc.id && d.itemtype === doc.itemtype && d.items_id === doc.items_id)) {
                    allDocuments.push(doc);
                  }
                }
              }
            }
          }
        }
      }
    }

    // 3. Obtener soluciones del ticket para buscar documentos adjuntos
    const solutionsResponse = await fetch(`${GLPI_URL}/Ticket/${ticketId}/ITILSolution`, {
      headers: {
        'App-Token': APP_TOKEN,
        'Session-Token': sessionToken,
      },
    });

    if (solutionsResponse.ok) {
      const solutions = await solutionsResponse.json();
      if (Array.isArray(solutions)) {
        for (const solution of solutions) {
          const solutionId = solution.id;

          const solutionDocsResponse = await fetch(
            `${GLPI_URL}/Document_Item?searchText[itemtype]=ITILSolution&searchText[items_id]=${solutionId}`,
            {
              headers: {
                'App-Token': APP_TOKEN,
                'Session-Token': sessionToken,
              },
            }
          );

          if (solutionDocsResponse.ok) {
            const solutionDocs: DocumentItem[] = await solutionDocsResponse.json();
            if (Array.isArray(solutionDocs)) {
              console.log(`[Documents] Solution ${solutionId} tiene ${solutionDocs.length} documentos`);
              for (const item of solutionDocs) {
                const doc = await fetchDocumentDetails(
                  item.documents_id,
                  sessionToken,
                  'ITILSolution',
                  solutionId,
                  item.date_creation,
                  item.users_id,
                  item.timeline_position
                );
                if (doc) {
                  // Permitir el mismo documento en diferentes soluciones
                  if (!allDocuments.some(d => d.id === doc.id && d.itemtype === doc.itemtype && d.items_id === doc.items_id)) {
                    allDocuments.push(doc);
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`[Documents] Ticket ${ticketId}: Total ${allDocuments.length} documentos encontrados`);
    allDocuments.forEach(doc => {
      console.log(`  - Doc ${doc.id}: ${doc.filename} -> ${doc.itemtype}:${doc.items_id}`);
    });

    return NextResponse.json(allDocuments);
  } catch (error) {
    console.error('Error obteniendo documentos:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
