// src/components/modals/TicketFormModal.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Trash2, File, CheckCircle, AlertCircle, Camera, Video, Mic, MicOff, Search, Brain, Sparkles } from 'lucide-react';
import type { AttachedFile } from '@/types';
import { formatFileSize, isImageFile, isVideoFile } from '@/utils';

interface TicketFormModalProps {
  userName: string;
  userEmail: string;
  userId: number;
  userTitle: string; // Título/Cargo del usuario
  userPhone: string; // Teléfono/Celular del usuario
  sessionToken: string;
  attachedFiles: AttachedFile[];
  fileInputRef: React.RefObject<HTMLInputElement>;
  cameraInputRef?: React.RefObject<HTMLInputElement>;
  maxFiles: number;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: (index: number) => void;
  onClose: () => void;
  onSuccess?: () => void;
}

export function TicketFormModal({
  userName,
  userEmail,
  userId,
  userTitle,
  userPhone,
  sessionToken,
  attachedFiles,
  fileInputRef,
  cameraInputRef,
  maxFiles,
  onFileSelect,
  onRemoveFile,
  onClose,
  onSuccess,
}: TicketFormModalProps) {
  // Estado del formulario
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isMobile, setIsMobile] = useState(false);

  // Detectar si es dispositivo móvil (solo en cliente)
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor;
      const isMobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      setIsMobile(isMobileDevice);
    };
    checkMobile();
  }, []);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitPending, setSubmitPending] = useState(false); // Ticket enviado pero sin confirmación de número
  const [ticketNumber, setTicketNumber] = useState<string | number | null>(null);
  const [ticketCreatedAt, setTicketCreatedAt] = useState<string | null>(null); // Fecha de creación del ticket
  const [processingStep, setProcessingStep] = useState(0); // 0: no iniciado, 1-4: pasos del proceso

  // Speech to Text
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Verificar soporte de Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechSupported(!!SpeechRecognition);
  }, []);

  // Iniciar/detener reconocimiento de voz
  const toggleSpeechRecognition = useCallback(() => {
    if (!speechSupported) {
      alert('Tu navegador no soporta reconocimiento de voz');
      return;
    }

    if (isListening) {
      // Detener
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    // Iniciar
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'es-EC'; // Español Ecuador
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      if (finalTranscript) {
        setDescription(prev => {
          const separator = prev.trim() ? ' ' : '';
          return prev + separator + finalTranscript;
        });
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        alert('Permiso de micrófono denegado. Por favor habilita el acceso al micrófono.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, speechSupported]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  // Validación básica
  const isFormValid = subject.trim().length > 0 && description.trim().length > 0;

  // Función para simular progreso de pasos mientras espera la respuesta
  const simulateProgress = useCallback(() => {
    // Paso 1: Revisando información (inmediato)
    setProcessingStep(1);

    // Paso 2: IA analizando (después de 2 segundos)
    const step2Timer = setTimeout(() => setProcessingStep(2), 2000);

    return () => {
      clearTimeout(step2Timer);
    };
  }, []);

  // Handler para enviar el ticket
  const handleSubmit = async () => {
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setProcessingStep(1); // Iniciar animación

    // Iniciar simulación de progreso
    const cleanupProgress = simulateProgress();

    try {
      const response = await fetch('/api/ticket/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          subject: subject.trim(),
          description: description.trim(),
          userId,
          userEmail,
          userName,
          userTitle,
          userPhone,
          sessionToken,
          attachments: attachedFiles,
        }),
      });

      const result = await response.json();

      // Limpiar timers de progreso
      cleanupProgress();

      if (!response.ok) {
        const errorMessage = result.details
          ? `${result.error}: ${result.details}`
          : (result.error || 'Error al crear el ticket');
        throw new Error(errorMessage);
      }

      console.log('[TicketFormModal] Ticket creado exitosamente:', result);

      // Paso 3: Ticket creado
      setProcessingStep(3);

      // Extraer el número de ticket y fecha de la respuesta de n8n
      // Nueva estructura: { data: [{ "2": ticketId, "15": fechaCreacion }], headers: { ticket: "750" } }
      // También soporta estructuras anteriores: [{ id: 716 }], { id: 123 }, { ticketId: 123 }, etc.
      const n8nData = result.n8nResponse;
      let ticketId = null;
      let createdAt = null;

      if (n8nData) {
        // Si es un array, tomar el primer elemento
        if (Array.isArray(n8nData) && n8nData.length > 0) {
          const firstItem = n8nData[0];

          // Nueva estructura de n8n con data array
          if (firstItem.data && Array.isArray(firstItem.data) && firstItem.data.length > 0) {
            const dataItem = firstItem.data[0];
            ticketId = dataItem["2"] || null; // Campo "2" contiene el ID del ticket
            createdAt = dataItem["15"] || null; // Campo "15" contiene la fecha de creación
          }

          // Fallback: headers.ticket
          if (!ticketId && firstItem.headers?.ticket) {
            ticketId = firstItem.headers.ticket;
          }

          // Fallback: estructura anterior
          if (!ticketId) {
            ticketId = firstItem.ticketId || firstItem.id || firstItem.ticket_id || firstItem.ticketNumber || null;
          }
        } else if (typeof n8nData === 'object') {
          // Si es un objeto directo
          // Nueva estructura con data array
          if (n8nData.data && Array.isArray(n8nData.data) && n8nData.data.length > 0) {
            const dataItem = n8nData.data[0];
            ticketId = dataItem["2"] || null;
            createdAt = dataItem["15"] || null;
          }

          // Fallback: headers.ticket
          if (!ticketId && n8nData.headers?.ticket) {
            ticketId = n8nData.headers.ticket;
          }

          // Fallback: estructura anterior
          if (!ticketId) {
            ticketId = n8nData.ticketId || n8nData.id || n8nData.ticket_id || n8nData.ticketNumber || null;
          }
        }

        if (ticketId) {
          setTicketNumber(ticketId);

          // Guardar la fecha de creación si está disponible
          if (createdAt) {
            setTicketCreatedAt(createdAt);
          }

          // Crear encuesta en estado borrador para este ticket
          // Se cambiará a 'pending' cuando el ticket se cierre
          try {
            await fetch('/api/satisfaction', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                glpi_ticket_id: ticketId,
                glpi_user_id: userId,
                user_email: userEmail,
                user_name: userName,
                ticket_subject: subject.trim(),
                satisfaction: null,
                status: 'draft', // Borrador hasta que el ticket se cierre
              }),
            });
            console.log('[TicketFormModal] Encuesta borrador creada para ticket:', ticketId);
          } catch (surveyError) {
            // No bloqueamos el flujo si falla la creación de la encuesta
            console.error('[TicketFormModal] Error creando encuesta borrador:', surveyError);
          }
        }
      }

      // Pequeña pausa para mostrar el paso antes del resultado
      await new Promise(resolve => setTimeout(resolve, 500));

      // Si obtuvimos un ticketId, es éxito confirmado
      // Si no hay ticketId, el ticket está "pendiente de procesamiento"
      if (ticketId) {
        setSubmitSuccess(true);
      } else {
        // n8n respondió pero sin número de ticket - puede haber fallado internamente
        setSubmitPending(true);
        console.warn('[TicketFormModal] n8n respondió sin número de ticket. Respuesta:', n8nData);
      }

      // Llamar callback de éxito si existe
      if (onSuccess) {
        onSuccess();
      }

      // Cerrar el modal después de 4 segundos (más tiempo para ver el número de ticket)
      setTimeout(() => {
        onClose();
      }, 4000);

    } catch (error) {
      console.error('[TicketFormModal] Error:', error);
      cleanupProgress();
      setProcessingStep(0);
      setSubmitError(error instanceof Error ? error.message : 'Error al crear el ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Definición de los pasos de procesamiento
  const processingSteps = [
    { icon: Search, text: 'Revisando la información de tu ticket', color: 'blue' },
    { icon: Brain, text: 'Nuestro agente de IA está buscando la mejor solución', color: 'purple' },
    { icon: Sparkles, text: '¡Ticket creado exitosamente!', color: 'green' },
  ];

  // Si el ticket se creó exitosamente, mostrar mensaje de éxito
  if (submitSuccess) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-200">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            ¡Ticket Creado!
          </h3>
          <p className="text-slate-600 mb-3">
            Tu ticket ha sido creado exitosamente.
          </p>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-sm text-blue-600 mb-1">Número de Ticket</p>
            <p className="text-2xl font-bold text-blue-700">#{ticketNumber}</p>
            {ticketCreatedAt && (
              <p className="text-sm text-blue-500 mt-2">
                Creado: {new Date(ticketCreatedAt).toLocaleString('es-EC', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Si el ticket fue enviado pero no se recibió número de ticket (error de n8n)
  if (submitPending) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 text-center animate-in zoom-in duration-200">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Ticket en Proceso
          </h3>
          <p className="text-slate-600 mb-4">
            Tu solicitud fue enviada pero hubo un problema al procesarla.
            Por favor, verifica en unos minutos si tu ticket fue creado o intenta nuevamente.
          </p>
          <button
            onClick={onClose}
            className="w-full h-12 bg-amber-500 text-white font-semibold rounded-xl hover:bg-amber-600 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    );
  }

  // Si está procesando, mostrar animación de pasos
  if (isSubmitting && processingStep > 0) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in duration-200">
          {/* Título */}
          <h3 className="text-xl font-bold text-slate-900 text-center mb-8">
            Creando tu ticket...
          </h3>

          {/* Lista de pasos */}
          <div className="space-y-4">
            {processingSteps.map((step, index) => {
              const stepNumber = index + 1;
              const isActive = processingStep === stepNumber;
              const isCompleted = processingStep > stepNumber;
              const IconComponent = step.icon;

              // Colores según el estado
              const getColors = () => {
                if (isCompleted) return 'bg-green-100 text-green-600 border-green-200';
                if (isActive) {
                  switch (step.color) {
                    case 'blue': return 'bg-blue-100 text-blue-600 border-blue-300';
                    case 'purple': return 'bg-purple-100 text-purple-600 border-purple-300';
                    case 'amber': return 'bg-amber-100 text-amber-600 border-amber-300';
                    case 'green': return 'bg-green-100 text-green-600 border-green-300';
                    default: return 'bg-blue-100 text-blue-600 border-blue-300';
                  }
                }
                return 'bg-slate-100 text-slate-400 border-slate-200';
              };

              return (
                <div
                  key={stepNumber}
                  className={`flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-500 ${
                    isActive ? getColors() : isCompleted ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  {/* Icono */}
                  <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border-2 transition-all duration-500 ${getColors()} ${isActive ? 'animate-pulse' : ''}`}>
                    {isCompleted ? (
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    ) : (
                      <IconComponent className={`w-6 h-6 ${isActive ? '' : 'opacity-50'}`} />
                    )}
                  </div>

                  {/* Texto */}
                  <div className="flex-1">
                    <p className={`font-medium transition-colors duration-500 ${
                      isCompleted ? 'text-green-700' : isActive ? 'text-slate-900' : 'text-slate-400'
                    }`}>
                      {step.text}
                    </p>
                    {isActive && !isCompleted && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Indicador de estado */}
                  {isCompleted && (
                    <span className="text-xs font-medium text-green-600 bg-green-100 px-2 py-1 rounded-full">
                      Listo
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Barra de progreso general */}
          <div className="mt-8">
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-700 ease-out"
                style={{ width: `${(processingStep / 3) * 100}%` }}
              ></div>
            </div>
            <p className="text-center text-sm text-slate-500 mt-2">
              Paso {processingStep} de 3
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl w-full sm:max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] flex flex-col animate-in slide-in-from-bottom sm:zoom-in duration-200">
        {/* Header Fijo */}
        <div className="flex-shrink-0 sticky top-0 bg-white border-b border-slate-200 px-4 sm:px-8 py-4 sm:py-6 rounded-t-3xl z-10">
          <div className="flex items-center justify-between">
            <div>
              {userName && (
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Hola {userName}
                </h3>
              )}
              <p className="text-sm sm:text-base text-slate-500 font-normal mt-1">
                Nuevo Ticket de Soporte
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-shrink-0 w-10 h-10 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-slate-500" />
            </button>
          </div>
        </div>

        {/* Formulario con Scroll */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-4 sm:py-6">
          <div className="space-y-5 sm:space-y-6">
            {/* Mensaje de error */}
            {submitError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error al crear el ticket</p>
                  <p className="text-sm text-red-600 mt-1">{submitError}</p>
                </div>
              </div>
            )}

            {/* Asunto */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Asunto *
              </label>
              <input
                id="ticket-subject"
                name="subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Describe brevemente el problema"
                disabled={isSubmitting}
                className="w-full h-12 px-4 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none text-sm sm:text-base disabled:opacity-50 disabled:bg-slate-50"
              />
            </div>

            {/* Descripción */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Descripción *
              </label>
              <div className="relative">
                <textarea
                  id="ticket-description"
                  name="description"
                  rows={5}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe el problema con el mayor detalle posible..."
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 pr-14 rounded-xl border-2 border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all outline-none resize-none text-sm sm:text-base disabled:opacity-50 disabled:bg-slate-50"
                />
                {/* Botón de micrófono para Speech-to-Text */}
                {speechSupported && (
                  <button
                    type="button"
                    onClick={toggleSpeechRecognition}
                    disabled={isSubmitting}
                    className={`absolute bottom-3 right-3 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                      isListening
                        ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    title={isListening ? 'Detener grabación' : 'Dictar descripción'}
                  >
                    {isListening ? (
                      <MicOff className="w-5 h-5" />
                    ) : (
                      <Mic className="w-5 h-5" />
                    )}
                  </button>
                )}
              </div>
              {isListening && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  Escuchando... Habla ahora
                </p>
              )}
            </div>

            {/* Archivos adjuntos */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Archivos Adjuntos (Opcional) - Máximo {maxFiles}
              </label>

              {/* Input oculto para archivos */}
              <input
                id="ticket-attachments"
                name="attachments"
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.gif,.pdf,.mp4,.webm,.mov,.avi"
                onChange={onFileSelect}
                multiple
                disabled={isSubmitting}
                className="hidden"
              />

              {/* Input oculto para cámara */}
              {cameraInputRef && (
                <input
                  id="ticket-camera"
                  name="camera"
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={onFileSelect}
                  disabled={isSubmitting}
                  className="hidden"
                />
              )}

              {/* Lista de archivos adjuntos */}
              {attachedFiles.length > 0 && (
                <div className="space-y-3 mb-4">
                  {attachedFiles.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="border-2 border-slate-200 rounded-xl p-3 bg-slate-50">
                      <div className="flex items-center gap-3">
                        {/* Preview de imagen, video o icono de archivo */}
                        {isImageFile(file.type) ? (
                          <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-white border border-slate-200">
                            <img
                              src={file.base64}
                              alt="Preview"
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : isVideoFile(file.type) ? (
                          <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-purple-100 border border-purple-200 flex items-center justify-center">
                            <Video className="w-6 h-6 text-purple-600" />
                          </div>
                        ) : (
                          <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-red-100 flex items-center justify-center">
                            <File className="w-6 h-6 text-red-600" />
                          </div>
                        )}

                        {/* Info del archivo */}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 text-sm truncate">
                            {file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>

                        {/* Botón eliminar */}
                        <button
                          type="button"
                          onClick={() => onRemoveFile(index)}
                          disabled={isSubmitting}
                          className="flex-shrink-0 w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 flex items-center justify-center transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Zona de botones para adjuntar - solo mostrar si hay espacio para más archivos */}
              {attachedFiles.length < maxFiles && (
                <div className="space-y-3">
                  {/* Botones de acción */}
                  <div className="flex gap-3">
                    {/* Botón Cámara - Solo visible en móviles */}
                    {cameraInputRef && isMobile && (
                      <button
                        type="button"
                        onClick={() => !isSubmitting && cameraInputRef.current?.click()}
                        disabled={isSubmitting}
                        className={`flex-1 border-2 border-dashed border-blue-300 rounded-xl p-4 text-center hover:border-blue-500 hover:bg-blue-50 transition-colors ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <Camera className="w-6 h-6 text-blue-500 mx-auto mb-1" />
                        <p className="text-xs sm:text-sm text-blue-600 font-medium">
                          Tomar Foto
                        </p>
                      </button>
                    )}

                    {/* Botón Archivos */}
                    <button
                      type="button"
                      onClick={() => !isSubmitting && fileInputRef.current?.click()}
                      disabled={isSubmitting}
                      className={`flex-1 border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-blue-400 hover:bg-blue-50/50 transition-colors ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <Upload className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs sm:text-sm text-slate-600 font-medium">
                        Subir Archivo
                      </p>
                    </button>
                  </div>

                  {/* Info de archivos */}
                  <p className="text-xs text-slate-400 text-center">
                    {attachedFiles.length > 0
                      ? `${attachedFiles.length}/${maxFiles} archivos adjuntos`
                      : 'Formatos: Imágenes, Videos, PDF (Max. 10MB)'
                    }
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer con Botones Fijos */}
        <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 sm:px-8 py-4 sm:py-6 pb-safe">
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              className="flex-1 h-14 sm:h-12 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-base font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Enviando...
                </>
              ) : (
                'Crear Ticket'
              )}
            </button>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 h-14 sm:h-12 border-2 border-slate-300 text-slate-700 text-base font-semibold rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
