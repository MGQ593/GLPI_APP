// src/app/page.tsx
'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ModalType, GlpiUser } from '@/types';

// Components
import { Header, SearchBar, StatsCards, ActionBanners, InactivityWarningModal } from '@/components';
import { EmailModal, TicketFormModal, TicketListModal, TicketDetailModal } from '@/components/modals';

// Hooks
import { useGlpiSession, useTickets, useTicketDetail, useUserCache, useAgentIds, useFileAttachments } from '@/hooks';
import { usePushNotifications } from '@/hooks/usePushNotifications';

export default function HomePage() {
  // Modal states
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [modalType, setModalType] = useState<ModalType>('create');
  const [showTicketForm, setShowTicketForm] = useState(false);
  const [showTickets, setShowTickets] = useState(false);

  // Session close handler
  const handleSessionClose = useCallback(() => {
    setShowTicketForm(false);
    setShowTickets(false);
  }, []);

  // GLPI Session hook
  const session = useGlpiSession(showTicketForm, showTickets, handleSessionClose);

  // Session init handler for tickets
  const handleSessionInit = useCallback((token: string, user: GlpiUser) => {
    // This is handled internally by useTickets
    console.log('Session initialized for tickets:', token, user.id);
  }, []);

  // Tickets hook
  const ticketsHook = useTickets(
    session.glpiSessionToken,
    session.glpiUser,
    session.email,
    showTickets,
    session.isLoadingSession,
    false, // sessionInitAttempted - managed internally
    handleSessionInit
  );

  // User cache hook
  const { fetchUserName } = useUserCache(session.glpiSessionToken);

  // Agent IDs hook
  const { getAgentIds } = useAgentIds(session.glpiSessionToken);

  // Ticket detail hook
  const ticketDetail = useTicketDetail(session.glpiSessionToken, fetchUserName, getAgentIds, session.glpiUser?.id, session.userName);

  // Ref para mantener valores actualizados para el callback de onTicketUpdated
  const ticketDetailRef = useRef({
    showTicketDetail: ticketDetail.showTicketDetail,
    selectedTicket: ticketDetail.selectedTicket,
    handleViewTicketDetail: ticketDetail.handleViewTicketDetail,
  });

  // Actualizar el ref cuando cambien los valores
  useEffect(() => {
    ticketDetailRef.current = {
      showTicketDetail: ticketDetail.showTicketDetail,
      selectedTicket: ticketDetail.selectedTicket,
      handleViewTicketDetail: ticketDetail.handleViewTicketDetail,
    };
  }, [ticketDetail.showTicketDetail, ticketDetail.selectedTicket, ticketDetail.handleViewTicketDetail]);

  // File attachments hook
  const fileAttachments = useFileAttachments();

  // Push notifications hook - se usa el email validado de la sesión
  const {
    isSupported: pushSupported,
    subscribe: subscribePush,
  } = usePushNotifications(session.email || null);

  // Initialize GLPI session when ticket form or ticket list opens
  useEffect(() => {
    if ((showTicketForm || showTickets) && !session.glpiSessionToken && !session.isLoadingSession) {
      session.initGlpiSession();
    }
  }, [showTicketForm, showTickets, session]);

  // Open modal handler
  const handleOpenModal = (type: ModalType) => {
    setModalType(type);
    setShowEmailModal(true);
    session.setEmail('');
    session.setErrorMessage('');
    setShowTicketForm(false);
    setShowTickets(false);
    ticketsHook.resetTickets();
    session.resetSession();
    fileAttachments.clearFiles();
  };

  // Email validation handler
  const handleValidateEmail = async () => {
    const isValid = await session.handleValidateEmail();
    if (isValid) {
      setShowEmailModal(false);
      if (modalType === 'create') {
        setShowTicketForm(true);
      } else {
        setShowTickets(true);
      }

      // Solicitar suscripción a push notifications después de validar el email
      // Esto aprovecha que el usuario ya ingresó su correo
      if (pushSupported) {
        console.log('[Push] Solicitando suscripción después de validar email');
        // Ejecutar en segundo plano sin bloquear la UI
        subscribePush().then((success) => {
          if (success) {
            console.log('[Push] Usuario suscrito exitosamente');
          }
        }).catch((error) => {
          console.log('[Push] No se pudo suscribir (usuario puede haber rechazado):', error);
        });
      }
    }
  };

  // Close ticket form
  const handleCloseTicketForm = () => {
    setShowTicketForm(false);
    fileAttachments.clearFiles();
  };

  // Close ticket list
  const handleCloseTicketList = () => {
    setShowTickets(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <SearchBar />
        <StatsCards />
        <ActionBanners
          onOpenCreateTicket={() => handleOpenModal('create')}
          onOpenConsultTickets={() => handleOpenModal('consult')}
        />
      </main>

      {/* Modal - Email Validation */}
      {showEmailModal && (
        <EmailModal
          modalType={modalType}
          email={session.email}
          setEmail={session.setEmail}
          errorMessage={session.errorMessage}
          setErrorMessage={session.setErrorMessage}
          isLoading={session.isLoading}
          onValidate={handleValidateEmail}
          onClose={() => setShowEmailModal(false)}
        />
      )}

      {/* Modal - Ticket Form */}
      {showTicketForm && (
        <TicketFormModal
          userName={session.userName}
          userEmail={session.email}
          userId={session.glpiUser?.id || 0}
          userTitle={session.glpiUser?.userTitle || ''}
          userPhone={session.glpiUser?.phone || ''}
          sessionToken={session.glpiSessionToken || ''}
          attachedFiles={fileAttachments.attachedFiles}
          fileInputRef={fileAttachments.fileInputRef}
          cameraInputRef={fileAttachments.cameraInputRef}
          maxFiles={fileAttachments.MAX_FILES}
          onFileSelect={fileAttachments.handleFileSelect}
          onRemoveFile={fileAttachments.handleRemoveFile}
          onClose={handleCloseTicketForm}
        />
      )}

      {/* Modal - Tickets List */}
      {showTickets && (
        <TicketListModal
          email={session.email}
          userId={session.glpiUser?.id}
          userName={session.userName}
          tickets={ticketsHook.tickets}
          isLoading={ticketsHook.isLoadingTickets}
          onViewDetail={ticketDetail.handleViewTicketDetail}
          onClose={handleCloseTicketList}
          sessionToken={ticketDetail.sessionToken}
          onTicketUpdated={(ticketId) => {
            // Usar el ref para obtener valores actualizados (evita problemas de closure)
            const { showTicketDetail, selectedTicket, handleViewTicketDetail } = ticketDetailRef.current;
            console.log('[Page] onTicketUpdated llamado con ticketId:', ticketId);
            console.log('[Page] showTicketDetail (ref):', showTicketDetail);
            console.log('[Page] selectedTicket?.rawId (ref):', selectedTicket?.rawId);
            // Si el ticket actualizado es el que está abierto en el modal de detalle, refrescar el timeline
            if (showTicketDetail && selectedTicket?.rawId === ticketId) {
              console.log('[Page] Refrescando timeline del ticket:', ticketId);
              handleViewTicketDetail(selectedTicket);
            }
          }}
        />
      )}

      {/* Modal - Ticket Detail */}
      {ticketDetail.showTicketDetail && ticketDetail.selectedTicket && (
        <TicketDetailModal
          ticket={ticketDetail.selectedTicket}
          timelineMessages={ticketDetail.timelineMessages}
          isLoading={ticketDetail.isLoadingDetail}
          isExpanded={ticketDetail.isDetailExpanded}
          setIsExpanded={ticketDetail.setIsDetailExpanded}
          newComment={ticketDetail.newComment}
          setNewComment={ticketDetail.setNewComment}
          isSendingComment={ticketDetail.isSendingComment}
          commentSuccess={ticketDetail.commentSuccess}
          commentError={ticketDetail.commentError}
          commentTextareaRef={ticketDetail.commentTextareaRef}
          onSendComment={ticketDetail.handleSendComment}
          onClose={ticketDetail.handleCloseTicketDetail}
          attachments={ticketDetail.attachments}
          attachmentFileInputRef={ticketDetail.attachmentFileInputRef}
          onFileSelect={ticketDetail.handleFileSelect}
          onRemoveAttachment={ticketDetail.removeAttachment}
          hasAttachments={ticketDetail.hasAttachments}
          attachmentError={ticketDetail.attachmentError}
          sessionToken={ticketDetail.sessionToken}
          onRefreshTimeline={() => ticketDetail.handleViewTicketDetail(ticketDetail.selectedTicket!)}
          loggedInUserId={session.glpiUser?.id}
        />
      )}

      {/* Modal - Inactivity Warning */}
      {session.showInactivityWarning && (
        <InactivityWarningModal
          secondsRemaining={session.secondsRemaining}
          onExtend={session.extendSession}
          onClose={session.handleSessionTimeout}
        />
      )}
    </div>
  );
}
