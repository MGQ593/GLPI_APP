import { NextRequest, NextResponse } from 'next/server';

// Validar que el email tenga el dominio correcto
function isValidEmailDomain(email: string): boolean {
  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'chevyplan.com.ec';
  const emailDomain = email.split('@')[1]?.toLowerCase();
  return emailDomain === allowedDomain.toLowerCase();
}

// Validar formato de email
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Interfaz para la respuesta del LDAP
interface LdapCheckResponse {
  exists: boolean;
  username: string;
  active: boolean;
  short_name: string;
  object_GUID: string;
  given_Name: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    // Validaciones de seguridad
    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'El correo electrónico es requerido' },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: 'El formato del correo electrónico no es válido' },
        { status: 400 }
      );
    }

    if (!isValidEmailDomain(email)) {
      const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN || 'chevyplan.com.ec';
      return NextResponse.json(
        { error: `Solo se permiten correos del dominio @${allowedDomain}` },
        { status: 403 }
      );
    }

    // Verificar que las variables de entorno estén configuradas
    const apiUrl = process.env.GLPI_API_URL;
    const username = process.env.GLPI_USERNAME;
    const password = process.env.GLPI_PASSWORD;
    const clientId = process.env.GLPI_CLIENT_ID;
    const clientSecret = process.env.GLPI_CLIENT_SECRET;

    if (!apiUrl || !username || !password || !clientId || !clientSecret) {
      console.error('Variables de entorno de GLPI no configuradas');
      return NextResponse.json(
        { error: 'Error de configuración del servidor' },
        { status: 500 }
      );
    }

    // PASO 1: Obtener el token de autenticación
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    formData.append('client_id', clientId);
    formData.append('client_secret', clientSecret);

    const tokenResponse = await fetch(`${apiUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Error de API GLPI (token):', tokenResponse.status, errorText);
      return NextResponse.json(
        { error: 'Error al autenticar con el servidor' },
        { status: tokenResponse.status }
      );
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      console.error('No se recibió access_token de GLPI');
      return NextResponse.json(
        { error: 'Error al obtener token de autenticación' },
        { status: 500 }
      );
    }

    // PASO 2: Validar el email en LDAP
    const ldapResponse = await fetch(`${apiUrl}/ldap/check_email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ email: email }),
    });

    if (!ldapResponse.ok) {
      const errorText = await ldapResponse.text();
      console.error('Error de API GLPI (LDAP):', ldapResponse.status, errorText);
      return NextResponse.json(
        { error: 'Error al validar el correo en el directorio' },
        { status: ldapResponse.status }
      );
    }

    const ldapData: LdapCheckResponse = await ldapResponse.json();

    // PASO 3: Validar que el usuario existe y está activo
    if (!ldapData.exists) {
      return NextResponse.json(
        { error: 'El correo electrónico no está registrado en el sistema' },
        { status: 404 }
      );
    }

    if (!ldapData.active) {
      return NextResponse.json(
        { error: 'El usuario no está activo en el sistema' },
        { status: 403 }
      );
    }

    // PASO 4: Usuario válido - devolver información necesaria
    return NextResponse.json({
      success: true,
      email: email,
      message: 'Autenticación exitosa',
      user: {
        givenName: ldapData.given_Name,
        fullName: ldapData.username,
        shortName: ldapData.short_name,
      }
    });

  } catch (error) {
    console.error('Error en autenticación:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
