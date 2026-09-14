export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      analytics_chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          thread_id: string
          tool_calls: Json | null
          tool_results: Json | null
          user_id: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          role: string
          thread_id: string
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          tool_calls?: Json | null
          tool_results?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "analytics_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_chat_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      commercial_goals: {
        Row: {
          created_at: string
          created_by: string | null
          escopo: string
          id: string
          meta_agendas: number | null
          meta_contatos: number | null
          meta_propostas: number | null
          meta_quantidade: number
          meta_valor: number
          observacao: string | null
          periodo: string
          pipeline_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          meta_agendas?: number | null
          meta_contatos?: number | null
          meta_propostas?: number | null
          meta_quantidade?: number
          meta_valor?: number
          observacao?: string | null
          periodo: string
          pipeline_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          meta_agendas?: number | null
          meta_contatos?: number | null
          meta_propostas?: number | null
          meta_quantidade?: number
          meta_valor?: number
          observacao?: string | null
          periodo?: string
          pipeline_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_goals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          analista_pda_declarado: boolean
          ativo: boolean
          cep: string | null
          cidade: string | null
          cnpj: string | null
          created_at: string
          created_at_original: string | null
          created_by: string | null
          dominio: string | null
          estado: string | null
          exemplo: boolean
          fonte_original: string | null
          hubspot_id: string | null
          id: string
          indicado_por: string | null
          lifecycle: string | null
          linkedin_url: string | null
          nome: string
          nome_normalizado: string | null
          num_funcionarios: number | null
          owner_original: string | null
          owner_user_id: string | null
          pais: string | null
          parent_company_id: string | null
          pendencia_financeira: string | null
          porte: string | null
          provenance: Json
          rd_org_id: string | null
          rfm_seed: string | null
          sdr_original: string | null
          sdr_user_id: string | null
          segmento: string | null
          site_url: string | null
          telefone: string | null
          tipo_lead: Database["public"]["Enums"]["cs_client_type"]
          uid: string
          unidade_codigo: string | null
          updated_at: string
        }
        Insert: {
          analista_pda_declarado?: boolean
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_at_original?: string | null
          created_by?: string | null
          dominio?: string | null
          estado?: string | null
          exemplo?: boolean
          fonte_original?: string | null
          hubspot_id?: string | null
          id?: string
          indicado_por?: string | null
          lifecycle?: string | null
          linkedin_url?: string | null
          nome: string
          nome_normalizado?: string | null
          num_funcionarios?: number | null
          owner_original?: string | null
          owner_user_id?: string | null
          pais?: string | null
          parent_company_id?: string | null
          pendencia_financeira?: string | null
          porte?: string | null
          provenance?: Json
          rd_org_id?: string | null
          rfm_seed?: string | null
          sdr_original?: string | null
          sdr_user_id?: string | null
          segmento?: string | null
          site_url?: string | null
          telefone?: string | null
          tipo_lead?: Database["public"]["Enums"]["cs_client_type"]
          uid: string
          unidade_codigo?: string | null
          updated_at?: string
        }
        Update: {
          analista_pda_declarado?: boolean
          ativo?: boolean
          cep?: string | null
          cidade?: string | null
          cnpj?: string | null
          created_at?: string
          created_at_original?: string | null
          created_by?: string | null
          dominio?: string | null
          estado?: string | null
          exemplo?: boolean
          fonte_original?: string | null
          hubspot_id?: string | null
          id?: string
          indicado_por?: string | null
          lifecycle?: string | null
          linkedin_url?: string | null
          nome?: string
          nome_normalizado?: string | null
          num_funcionarios?: number | null
          owner_original?: string | null
          owner_user_id?: string | null
          pais?: string | null
          parent_company_id?: string | null
          pendencia_financeira?: string | null
          porte?: string | null
          provenance?: Json
          rd_org_id?: string | null
          rfm_seed?: string | null
          sdr_original?: string | null
          sdr_user_id?: string | null
          segmento?: string | null
          site_url?: string | null
          telefone?: string | null
          tipo_lead?: Database["public"]["Enums"]["cs_client_type"]
          uid?: string
          unidade_codigo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_contacts: {
        Row: {
          company_id: string
          contact_id: string
          created_at: string
          papel: string | null
          principal: boolean
        }
        Insert: {
          company_id: string
          contact_id: string
          created_at?: string
          papel?: string | null
          principal?: boolean
        }
        Update: {
          company_id?: string
          contact_id?: string
          created_at?: string
          papel?: string | null
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          analista_certificado_em: string | null
          analista_pda: boolean
          ativo: boolean
          cargo: string | null
          cidade: string | null
          company_id: string | null
          created_at: string
          created_at_original: string | null
          created_by: string | null
          cs_owner_original: string | null
          departamento: string | null
          dor_interesse: string | null
          email: string | null
          emails: string[]
          estado: string | null
          fonte_original: string | null
          fonte_recente_original: string | null
          hubspot_id: string | null
          id: string
          interesse: string | null
          last_activity_original: string | null
          lifecycle: string | null
          linkedin_url: string | null
          modulos: string[]
          nome: string
          owner_original: string | null
          phones: string[]
          provenance: Json
          rd_contact_id: string | null
          sdr_original: string | null
          sdr_user_id: string | null
          telefone: string | null
          updated_at: string
        }
        Insert: {
          analista_certificado_em?: string | null
          analista_pda?: boolean
          ativo?: boolean
          cargo?: string | null
          cidade?: string | null
          company_id?: string | null
          created_at?: string
          created_at_original?: string | null
          created_by?: string | null
          cs_owner_original?: string | null
          departamento?: string | null
          dor_interesse?: string | null
          email?: string | null
          emails?: string[]
          estado?: string | null
          fonte_original?: string | null
          fonte_recente_original?: string | null
          hubspot_id?: string | null
          id?: string
          interesse?: string | null
          last_activity_original?: string | null
          lifecycle?: string | null
          linkedin_url?: string | null
          modulos?: string[]
          nome: string
          owner_original?: string | null
          phones?: string[]
          provenance?: Json
          rd_contact_id?: string | null
          sdr_original?: string | null
          sdr_user_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Update: {
          analista_certificado_em?: string | null
          analista_pda?: boolean
          ativo?: boolean
          cargo?: string | null
          cidade?: string | null
          company_id?: string | null
          created_at?: string
          created_at_original?: string | null
          created_by?: string | null
          cs_owner_original?: string | null
          departamento?: string | null
          dor_interesse?: string | null
          email?: string | null
          emails?: string[]
          estado?: string | null
          fonte_original?: string | null
          fonte_recente_original?: string | null
          hubspot_id?: string | null
          id?: string
          interesse?: string | null
          last_activity_original?: string | null
          lifecycle?: string | null
          linkedin_url?: string | null
          modulos?: string[]
          nome?: string
          owner_original?: string | null
          phones?: string[]
          provenance?: Json
          rd_contact_id?: string | null
          sdr_original?: string | null
          sdr_user_id?: string | null
          telefone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_alerts: {
        Row: {
          agenda_type: string | null
          alert_type: string
          client_uid: string
          contact_type: string | null
          created_at: string
          follow_up_at: string | null
          id: string
          observation: string | null
          reason: string
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
          whatsapp_answered: boolean | null
        }
        Insert: {
          agenda_type?: string | null
          alert_type: string
          client_uid: string
          contact_type?: string | null
          created_at?: string
          follow_up_at?: string | null
          id?: string
          observation?: string | null
          reason: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
          whatsapp_answered?: boolean | null
        }
        Update: {
          agenda_type?: string | null
          alert_type?: string
          client_uid?: string
          contact_type?: string | null
          created_at?: string
          follow_up_at?: string | null
          id?: string
          observation?: string | null
          reason?: string
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
          whatsapp_answered?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_alerts_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_cadence_tasks: {
        Row: {
          channel: string | null
          client_uid: string
          color: string
          created_at: string
          created_by: string | null
          done: boolean
          done_at: string | null
          done_by: string | null
          done_via: string | null
          evidence_event_id: string | null
          id: string
          notes: string | null
          owner_id: string | null
          title: string
          updated_at: string
          urgency: string
          week_start: string
          weekday: number
        }
        Insert: {
          channel?: string | null
          client_uid: string
          color?: string
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          done_via?: string | null
          evidence_event_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          title?: string
          updated_at?: string
          urgency?: string
          week_start: string
          weekday?: number
        }
        Update: {
          channel?: string | null
          client_uid?: string
          color?: string
          created_at?: string
          created_by?: string | null
          done?: boolean
          done_at?: string | null
          done_by?: string | null
          done_via?: string | null
          evidence_event_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          title?: string
          updated_at?: string
          urgency?: string
          week_start?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "cs_cadence_tasks_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
          {
            foreignKeyName: "cs_cadence_tasks_evidence_event_id_fkey"
            columns: ["evidence_event_id"]
            isOneToOne: false
            referencedRelation: "cs_timeline_events"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_calendly_events: {
        Row: {
          attendees: Json
          cancel_reason: string | null
          client_uid: string | null
          contact_id: string | null
          created_at: string
          end_time: string | null
          event_uri: string
          id: string
          invitee_email: string | null
          invitee_name: string | null
          location: string | null
          meeting_url: string | null
          name: string | null
          organizer_email: string | null
          provider: string
          raw: Json
          settled_at: string | null
          start_time: string
          status: string | null
          synced_at: string
          user_id: string
        }
        Insert: {
          attendees?: Json
          cancel_reason?: string | null
          client_uid?: string | null
          contact_id?: string | null
          created_at?: string
          end_time?: string | null
          event_uri: string
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          location?: string | null
          meeting_url?: string | null
          name?: string | null
          organizer_email?: string | null
          provider?: string
          raw?: Json
          settled_at?: string | null
          start_time: string
          status?: string | null
          synced_at?: string
          user_id: string
        }
        Update: {
          attendees?: Json
          cancel_reason?: string | null
          client_uid?: string | null
          contact_id?: string | null
          created_at?: string
          end_time?: string | null
          event_uri?: string
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          location?: string | null
          meeting_url?: string | null
          name?: string | null
          organizer_email?: string | null
          provider?: string
          raw?: Json
          settled_at?: string | null
          start_time?: string
          status?: string | null
          synced_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_calendly_events_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
          {
            foreignKeyName: "cs_calendly_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cs_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_client_tags: {
        Row: {
          client_uid: string
          created_by: string | null
          data_criacao: string
          id: string
          origem_agenda_id: string | null
          tag: string
        }
        Insert: {
          client_uid: string
          created_by?: string | null
          data_criacao?: string
          id?: string
          origem_agenda_id?: string | null
          tag: string
        }
        Update: {
          client_uid?: string
          created_by?: string | null
          data_criacao?: string
          id?: string
          origem_agenda_id?: string | null
          tag?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_client_tags_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_clients: {
        Row: {
          aporte_valor: number
          ativo: boolean
          client_uid: string
          cnpj: string | null
          comercial_responsavel_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          cs_responsavel_id: string | null
          current_signal: Database["public"]["Enums"]["cs_signal"]
          data_inicio_contrato: string | null
          data_renovacao: string | null
          dg_ativo: boolean
          diagnostico_causa: string | null
          exemplo: boolean
          health_score: number
          id: string
          journey_stage: Database["public"]["Enums"]["cs_journey_stage"]
          last_contact_at: string | null
          linkedin_url: string | null
          login_pda: string | null
          nome_empresa: string
          num_funcionarios: number | null
          origem: Database["public"]["Enums"]["cs_origin"]
          parent_client_uid: string | null
          pda_consumo_pct: number | null
          pessoas_mapeadas: number | null
          porte: string | null
          primeiro_sucesso_at: string | null
          produtos_ativos: string[]
          provenance: Json
          rd_lifecycle: string | null
          rd_org_id: string | null
          rd_owner: string | null
          rd_synced_at: string | null
          segundo_sucesso_at: string | null
          setor: string | null
          site_url: string | null
          stage_entered_at: string
          tag_uso: string | null
          tipo_lead: Database["public"]["Enums"]["cs_client_type"]
          tipo_servico: string | null
          updated_at: string
        }
        Insert: {
          aporte_valor?: number
          ativo?: boolean
          client_uid: string
          cnpj?: string | null
          comercial_responsavel_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cs_responsavel_id?: string | null
          current_signal?: Database["public"]["Enums"]["cs_signal"]
          data_inicio_contrato?: string | null
          data_renovacao?: string | null
          dg_ativo?: boolean
          diagnostico_causa?: string | null
          exemplo?: boolean
          health_score?: number
          id?: string
          journey_stage?: Database["public"]["Enums"]["cs_journey_stage"]
          last_contact_at?: string | null
          linkedin_url?: string | null
          login_pda?: string | null
          nome_empresa: string
          num_funcionarios?: number | null
          origem?: Database["public"]["Enums"]["cs_origin"]
          parent_client_uid?: string | null
          pda_consumo_pct?: number | null
          pessoas_mapeadas?: number | null
          porte?: string | null
          primeiro_sucesso_at?: string | null
          produtos_ativos?: string[]
          provenance?: Json
          rd_lifecycle?: string | null
          rd_org_id?: string | null
          rd_owner?: string | null
          rd_synced_at?: string | null
          segundo_sucesso_at?: string | null
          setor?: string | null
          site_url?: string | null
          stage_entered_at?: string
          tag_uso?: string | null
          tipo_lead?: Database["public"]["Enums"]["cs_client_type"]
          tipo_servico?: string | null
          updated_at?: string
        }
        Update: {
          aporte_valor?: number
          ativo?: boolean
          client_uid?: string
          cnpj?: string | null
          comercial_responsavel_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          cs_responsavel_id?: string | null
          current_signal?: Database["public"]["Enums"]["cs_signal"]
          data_inicio_contrato?: string | null
          data_renovacao?: string | null
          dg_ativo?: boolean
          diagnostico_causa?: string | null
          exemplo?: boolean
          health_score?: number
          id?: string
          journey_stage?: Database["public"]["Enums"]["cs_journey_stage"]
          last_contact_at?: string | null
          linkedin_url?: string | null
          login_pda?: string | null
          nome_empresa?: string
          num_funcionarios?: number | null
          origem?: Database["public"]["Enums"]["cs_origin"]
          parent_client_uid?: string | null
          pda_consumo_pct?: number | null
          pessoas_mapeadas?: number | null
          porte?: string | null
          primeiro_sucesso_at?: string | null
          produtos_ativos?: string[]
          provenance?: Json
          rd_lifecycle?: string | null
          rd_org_id?: string | null
          rd_owner?: string | null
          rd_synced_at?: string | null
          segundo_sucesso_at?: string | null
          setor?: string | null
          site_url?: string | null
          stage_entered_at?: string
          tag_uso?: string | null
          tipo_lead?: Database["public"]["Enums"]["cs_client_type"]
          tipo_servico?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_clients_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_contacts: {
        Row: {
          analista_certificado_em: string | null
          analista_pda: boolean
          ativo_no_cliente: boolean
          cargo: string | null
          client_uid: string
          contact_id: string | null
          created_at: string
          email: string | null
          id: string
          modulos_vinculados: string[]
          nome: string
          origem_detecao: Database["public"]["Enums"]["cs_contact_origin"]
          rd_contact_id: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          analista_certificado_em?: string | null
          analista_pda?: boolean
          ativo_no_cliente?: boolean
          cargo?: string | null
          client_uid: string
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          modulos_vinculados?: string[]
          nome: string
          origem_detecao?: Database["public"]["Enums"]["cs_contact_origin"]
          rd_contact_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          analista_certificado_em?: string | null
          analista_pda?: boolean
          ativo_no_cliente?: boolean
          cargo?: string | null
          client_uid?: string
          contact_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          modulos_vinculados?: string[]
          nome?: string
          origem_detecao?: Database["public"]["Enums"]["cs_contact_origin"]
          rd_contact_id?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_contacts_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
          {
            foreignKeyName: "cs_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_delegations: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string | null
          from_user_id: string
          id: string
          reason: string | null
          starts_at: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          from_user_id: string
          id?: string
          reason?: string | null
          starts_at?: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          from_user_id?: string
          id?: string
          reason?: string | null
          starts_at?: string
          to_user_id?: string
        }
        Relationships: []
      }
      cs_emails: {
        Row: {
          body_html: string | null
          body_text: string | null
          cc_emails: string[]
          client_uid: string | null
          created_at: string
          direction: string
          from_email: string | null
          from_name: string | null
          id: string
          mailbox: string | null
          message_id: string | null
          owner_user_id: string | null
          raw: Json
          received_at: string
          snippet: string | null
          subject: string | null
          to_emails: string[]
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          client_uid?: string | null
          created_at?: string
          direction?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          mailbox?: string | null
          message_id?: string | null
          owner_user_id?: string | null
          raw?: Json
          received_at?: string
          snippet?: string | null
          subject?: string | null
          to_emails?: string[]
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          cc_emails?: string[]
          client_uid?: string | null
          created_at?: string
          direction?: string
          from_email?: string | null
          from_name?: string | null
          id?: string
          mailbox?: string | null
          message_id?: string | null
          owner_user_id?: string | null
          raw?: Json
          received_at?: string
          snippet?: string | null
          subject?: string | null
          to_emails?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "cs_emails_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_escalation_notices: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          acted: boolean
          client_uid: string
          days_late: number
          due_at: string
          first_seen_at: string
          kind: string
          last_seen_at: string
          note: string | null
          notified_at: string | null
          owner_id: string | null
          reason: string
          ref_id: string
          resolved_at: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acted?: boolean
          client_uid: string
          days_late?: number
          due_at: string
          first_seen_at?: string
          kind: string
          last_seen_at?: string
          note?: string | null
          notified_at?: string | null
          owner_id?: string | null
          reason?: string
          ref_id: string
          resolved_at?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          acted?: boolean
          client_uid?: string
          days_late?: number
          due_at?: string
          first_seen_at?: string
          kind?: string
          last_seen_at?: string
          note?: string | null
          notified_at?: string | null
          owner_id?: string | null
          reason?: string
          ref_id?: string
          resolved_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_escalation_notices_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_feature_offers: {
        Row: {
          client_uid: string
          created_at: string
          created_by: string | null
          feature_id: string
          id: string
          note: string | null
          offered_at: string
          status: string
          updated_at: string
        }
        Insert: {
          client_uid: string
          created_at?: string
          created_by?: string | null
          feature_id: string
          id?: string
          note?: string | null
          offered_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          client_uid?: string
          created_at?: string
          created_by?: string | null
          feature_id?: string
          id?: string
          note?: string | null
          offered_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_feature_offers_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_journey_emails: {
        Row: {
          client_uid: string
          contact_id: string | null
          created_at: string
          due_at: string
          email_id: string
          error: string | null
          id: string
          note: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string | null
          to_email: string | null
          to_name: string | null
          updated_at: string
        }
        Insert: {
          client_uid: string
          contact_id?: string | null
          created_at?: string
          due_at: string
          email_id: string
          error?: string | null
          id?: string
          note?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          to_name?: string | null
          updated_at?: string
        }
        Update: {
          client_uid?: string
          contact_id?: string | null
          created_at?: string
          due_at?: string
          email_id?: string
          error?: string | null
          id?: string
          note?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string | null
          to_email?: string | null
          to_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_journey_emails_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
          {
            foreignKeyName: "cs_journey_emails_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cs_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_masterclass_participations: {
        Row: {
          analista_id: string | null
          client_uid: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          held_at: string
          id: string
          module_id: number
          notes: string | null
          participantes: string | null
          updated_at: string
          used_at: string | null
          used_in_project: boolean
          used_note: string | null
        }
        Insert: {
          analista_id?: string | null
          client_uid: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          held_at?: string
          id?: string
          module_id: number
          notes?: string | null
          participantes?: string | null
          updated_at?: string
          used_at?: string | null
          used_in_project?: boolean
          used_note?: string | null
        }
        Update: {
          analista_id?: string | null
          client_uid?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          held_at?: string
          id?: string
          module_id?: number
          notes?: string | null
          participantes?: string | null
          updated_at?: string
          used_at?: string | null
          used_in_project?: boolean
          used_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_masterclass_participations_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
          {
            foreignKeyName: "cs_masterclass_participations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cs_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_meeting_categories: {
        Row: {
          ativo: boolean
          color: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          color?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      cs_meetings: {
        Row: {
          attendees: string | null
          calendly_event_id: string | null
          category_id: string | null
          client_uid: string
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          id: string
          meeting_url: string | null
          next_step: string | null
          next_step_at: string | null
          occurred_at: string
          owner_user_id: string | null
          source: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          attendees?: string | null
          calendly_event_id?: string | null
          category_id?: string | null
          client_uid: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_url?: string | null
          next_step?: string | null
          next_step_at?: string | null
          occurred_at?: string
          owner_user_id?: string | null
          source?: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          attendees?: string | null
          calendly_event_id?: string | null
          category_id?: string | null
          client_uid?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          id?: string
          meeting_url?: string | null
          next_step?: string | null
          next_step_at?: string | null
          occurred_at?: string
          owner_user_id?: string | null
          source?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_meetings_calendly_event_id_fkey"
            columns: ["calendly_event_id"]
            isOneToOne: false
            referencedRelation: "cs_calendly_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_meetings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "cs_meeting_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_meetings_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_oportunidades: {
        Row: {
          assumida_em: string | null
          assumida_por: string | null
          client_uid: string
          created_at: string
          deal_id: string | null
          descartada_motivo: string | null
          id: string
          motivo: string
          produto_sugerido: string | null
          sinalizada_em: string
          sinalizada_por: string | null
          status: string
          tipo: string
          updated_at: string
          valor_estimado: number | null
        }
        Insert: {
          assumida_em?: string | null
          assumida_por?: string | null
          client_uid: string
          created_at?: string
          deal_id?: string | null
          descartada_motivo?: string | null
          id?: string
          motivo: string
          produto_sugerido?: string | null
          sinalizada_em?: string
          sinalizada_por?: string | null
          status?: string
          tipo: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Update: {
          assumida_em?: string | null
          assumida_por?: string | null
          client_uid?: string
          created_at?: string
          deal_id?: string | null
          descartada_motivo?: string | null
          id?: string
          motivo?: string
          produto_sugerido?: string | null
          sinalizada_em?: string
          sinalizada_por?: string | null
          status?: string
          tipo?: string
          updated_at?: string
          valor_estimado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cs_oportunidades_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_playbook_blocks: {
        Row: {
          ativo: boolean
          cor: string
          corpo: string
          created_at: string
          created_by: string | null
          id: string
          ordem: number
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          corpo: string
          created_at?: string
          created_by?: string | null
          id?: string
          ordem?: number
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          corpo?: string
          created_at?: string
          created_by?: string | null
          id?: string
          ordem?: number
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
      }
      cs_records: {
        Row: {
          author_id: string | null
          client_uid: string
          content: string
          created_at: string
          id: string
          tipo: string
        }
        Insert: {
          author_id?: string | null
          client_uid: string
          content: string
          created_at?: string
          id?: string
          tipo?: string
        }
        Update: {
          author_id?: string | null
          client_uid?: string
          content?: string
          created_at?: string
          id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_records_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_sales: {
        Row: {
          category: string | null
          client_uid: string
          contract_ref: string | null
          created_at: string
          created_by: string | null
          currency: string
          discount: number
          external_key: string | null
          id: string
          item_kind: string
          item_name: string
          notes: string | null
          owner_user_id: string | null
          payment_method: string | null
          period_end: string | null
          period_start: string | null
          quantity: number
          recurrence: string
          sale_date: string
          source: string
          status: string
          total_value: number
          unit_value: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          client_uid: string
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          external_key?: string | null
          id?: string
          item_kind?: string
          item_name: string
          notes?: string | null
          owner_user_id?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          quantity?: number
          recurrence?: string
          sale_date?: string
          source?: string
          status?: string
          total_value?: number
          unit_value?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          client_uid?: string
          contract_ref?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number
          external_key?: string | null
          id?: string
          item_kind?: string
          item_name?: string
          notes?: string | null
          owner_user_id?: string | null
          payment_method?: string | null
          period_end?: string | null
          period_start?: string | null
          quantity?: number
          recurrence?: string
          sale_date?: string
          source?: string
          status?: string
          total_value?: number
          unit_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_sales_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      cs_signal_snapshots: {
        Row: {
          client_uid: string
          consumo_pct: number | null
          created_at: string
          health_score: number | null
          id: string
          metadata: Json
          signal: Database["public"]["Enums"]["cs_signal"]
          source: string
          week_start: string
        }
        Insert: {
          client_uid: string
          consumo_pct?: number | null
          created_at?: string
          health_score?: number | null
          id?: string
          metadata?: Json
          signal?: Database["public"]["Enums"]["cs_signal"]
          source?: string
          week_start: string
        }
        Update: {
          client_uid?: string
          consumo_pct?: number | null
          created_at?: string
          health_score?: number | null
          id?: string
          metadata?: Json
          signal?: Database["public"]["Enums"]["cs_signal"]
          source?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_signal_snapshots_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_tasks: {
        Row: {
          client_uid: string
          completed_via: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          done_at: string | null
          done_by: string | null
          due_at: string
          evidence_at: string | null
          evidence_event_id: string | null
          id: string
          notes: string | null
          owner_id: string | null
          source: string
          source_ref: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          client_uid: string
          completed_via?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string
          evidence_at?: string | null
          evidence_event_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          source?: string
          source_ref?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_uid?: string
          completed_via?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          done_at?: string | null
          done_by?: string | null
          due_at?: string
          evidence_at?: string | null
          evidence_event_id?: string | null
          id?: string
          notes?: string | null
          owner_id?: string | null
          source?: string
          source_ref?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_tasks_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
          {
            foreignKeyName: "cs_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "cs_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cs_tasks_evidence_event_id_fkey"
            columns: ["evidence_event_id"]
            isOneToOne: false
            referencedRelation: "cs_timeline_events"
            referencedColumns: ["id"]
          },
        ]
      }
      cs_timeline_events: {
        Row: {
          author_id: string | null
          channel: string | null
          client_uid: string
          created_at: string
          description: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          title: string
        }
        Insert: {
          author_id?: string | null
          channel?: string | null
          client_uid: string
          created_at?: string
          description?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          title: string
        }
        Update: {
          author_id?: string | null
          channel?: string | null
          client_uid?: string
          created_at?: string
          description?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cs_timeline_events_client_uid_fkey"
            columns: ["client_uid"]
            isOneToOne: false
            referencedRelation: "cs_clients"
            referencedColumns: ["client_uid"]
          },
        ]
      }
      cs_user_integrations: {
        Row: {
          calendly_connected_at: string | null
          calendly_email: string | null
          calendly_last_error: string | null
          calendly_last_sync_at: string | null
          calendly_name: string | null
          calendly_org_uri: string | null
          calendly_token: string | null
          calendly_user_uri: string | null
          created_at: string
          email_address: string | null
          email_connected_at: string | null
          gcal_connected_at: string | null
          gcal_email: string | null
          gcal_ics_url: string | null
          gcal_last_error: string | null
          gcal_last_sync_at: string | null
          meeting_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calendly_connected_at?: string | null
          calendly_email?: string | null
          calendly_last_error?: string | null
          calendly_last_sync_at?: string | null
          calendly_name?: string | null
          calendly_org_uri?: string | null
          calendly_token?: string | null
          calendly_user_uri?: string | null
          created_at?: string
          email_address?: string | null
          email_connected_at?: string | null
          gcal_connected_at?: string | null
          gcal_email?: string | null
          gcal_ics_url?: string | null
          gcal_last_error?: string | null
          gcal_last_sync_at?: string | null
          meeting_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          calendly_connected_at?: string | null
          calendly_email?: string | null
          calendly_last_error?: string | null
          calendly_last_sync_at?: string | null
          calendly_name?: string | null
          calendly_org_uri?: string | null
          calendly_token?: string | null
          calendly_user_uri?: string | null
          created_at?: string
          email_address?: string | null
          email_connected_at?: string | null
          gcal_connected_at?: string | null
          gcal_email?: string | null
          gcal_ics_url?: string | null
          gcal_last_error?: string | null
          gcal_last_sync_at?: string | null
          meeting_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      deal_activities: {
        Row: {
          author_id: string | null
          created_at: string
          de_stage_id: string | null
          deal_id: string
          descricao: string | null
          id: string
          occurred_at: string
          para_stage_id: string | null
          tipo: string
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          de_stage_id?: string | null
          deal_id: string
          descricao?: string | null
          id?: string
          occurred_at?: string
          para_stage_id?: string | null
          tipo: string
        }
        Update: {
          author_id?: string | null
          created_at?: string
          de_stage_id?: string | null
          deal_id?: string
          descricao?: string | null
          id?: string
          occurred_at?: string
          para_stage_id?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "deal_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_contacts: {
        Row: {
          contact_id: string
          deal_id: string
          principal: boolean
        }
        Insert: {
          contact_id: string
          deal_id: string
          principal?: boolean
        }
        Update: {
          contact_id?: string
          deal_id?: string
          principal?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "deal_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_contacts_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_products: {
        Row: {
          deal_id: string
          id: string
          nome: string
          product_id: string | null
          quantidade: number
          total: number
          valor_unitario: number
        }
        Insert: {
          deal_id: string
          id?: string
          nome: string
          product_id?: string | null
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Update: {
          deal_id?: string
          id?: string
          nome?: string
          product_id?: string | null
          quantidade?: number
          total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "deal_products_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          adm_checked_at: string | null
          adm_checked_by: string | null
          agendado_em: string | null
          amount: number
          campanha: string | null
          categoria_venda: string | null
          closed_at: string | null
          closed_at_original: string | null
          company_id: string | null
          contact_id: string | null
          contrato_assinado_em: string | null
          created_at: string
          created_at_original: string | null
          created_by: string | null
          cs_entregue_em: string | null
          currency: string
          devolutiva_em: string | null
          devolutiva_user_id: string | null
          esteira: string
          executivo_user_id: string | null
          exemplo: boolean
          faturado_em: string | null
          fonte: string | null
          fonte_original: string | null
          hubspot_id: string | null
          id: string
          lost_note: string | null
          lost_reason: string | null
          motivo_venda: string | null
          nome: string
          observacao_adm: string | null
          ordem_compra_em: string | null
          ordem_compra_numero: string | null
          owner_original: string | null
          owner_user_id: string | null
          pipeline_id: string | null
          produtos_texto: string | null
          proposta_aceita_em: string | null
          proximo_passo: string | null
          proximo_passo_em: string | null
          provenance: Json
          rd_deal_id: string | null
          rd_pipeline: string | null
          rd_stage: string | null
          reuniao_em: string | null
          sdr_user_id: string | null
          stage_id: string | null
          status: string
          status_reuniao: string | null
          temperatura: string | null
          tipo_venda: string | null
          trilha: string | null
          updated_at: string
        }
        Insert: {
          adm_checked_at?: string | null
          adm_checked_by?: string | null
          agendado_em?: string | null
          amount?: number
          campanha?: string | null
          categoria_venda?: string | null
          closed_at?: string | null
          closed_at_original?: string | null
          company_id?: string | null
          contact_id?: string | null
          contrato_assinado_em?: string | null
          created_at?: string
          created_at_original?: string | null
          created_by?: string | null
          cs_entregue_em?: string | null
          currency?: string
          devolutiva_em?: string | null
          devolutiva_user_id?: string | null
          esteira?: string
          executivo_user_id?: string | null
          exemplo?: boolean
          faturado_em?: string | null
          fonte?: string | null
          fonte_original?: string | null
          hubspot_id?: string | null
          id?: string
          lost_note?: string | null
          lost_reason?: string | null
          motivo_venda?: string | null
          nome: string
          observacao_adm?: string | null
          ordem_compra_em?: string | null
          ordem_compra_numero?: string | null
          owner_original?: string | null
          owner_user_id?: string | null
          pipeline_id?: string | null
          produtos_texto?: string | null
          proposta_aceita_em?: string | null
          proximo_passo?: string | null
          proximo_passo_em?: string | null
          provenance?: Json
          rd_deal_id?: string | null
          rd_pipeline?: string | null
          rd_stage?: string | null
          reuniao_em?: string | null
          sdr_user_id?: string | null
          stage_id?: string | null
          status?: string
          status_reuniao?: string | null
          temperatura?: string | null
          tipo_venda?: string | null
          trilha?: string | null
          updated_at?: string
        }
        Update: {
          adm_checked_at?: string | null
          adm_checked_by?: string | null
          agendado_em?: string | null
          amount?: number
          campanha?: string | null
          categoria_venda?: string | null
          closed_at?: string | null
          closed_at_original?: string | null
          company_id?: string | null
          contact_id?: string | null
          contrato_assinado_em?: string | null
          created_at?: string
          created_at_original?: string | null
          created_by?: string | null
          cs_entregue_em?: string | null
          currency?: string
          devolutiva_em?: string | null
          devolutiva_user_id?: string | null
          esteira?: string
          executivo_user_id?: string | null
          exemplo?: boolean
          faturado_em?: string | null
          fonte?: string | null
          fonte_original?: string | null
          hubspot_id?: string | null
          id?: string
          lost_note?: string | null
          lost_reason?: string | null
          motivo_venda?: string | null
          nome?: string
          observacao_adm?: string | null
          ordem_compra_em?: string | null
          ordem_compra_numero?: string | null
          owner_original?: string | null
          owner_user_id?: string | null
          pipeline_id?: string | null
          produtos_texto?: string | null
          proposta_aceita_em?: string | null
          proximo_passo?: string | null
          proximo_passo_em?: string | null
          provenance?: Json
          rd_deal_id?: string | null
          rd_pipeline?: string | null
          rd_stage?: string | null
          reuniao_em?: string | null
          sdr_user_id?: string | null
          stage_id?: string | null
          status?: string
          status_reuniao?: string | null
          temperatura?: string | null
          tipo_venda?: string | null
          trilha?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      dedupe_candidates: {
        Row: {
          created_at: string
          id: string
          kind: string
          left_id: string
          motivo: string
          resolved_at: string | null
          resolved_by: string | null
          right_id: string
          score: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          left_id: string
          motivo: string
          resolved_at?: string | null
          resolved_by?: string | null
          right_id: string
          score?: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          left_id?: string
          motivo?: string
          resolved_at?: string | null
          resolved_by?: string | null
          right_id?: string
          score?: number
          status?: string
        }
        Relationships: []
      }
      icp_config: {
        Row: {
          id: string
          is_active: boolean
          name: string
          rules: Json
          thresholds: Json
          updated_at: string
        }
        Insert: {
          id?: string
          is_active?: boolean
          name?: string
          rules?: Json
          thresholds?: Json
          updated_at?: string
        }
        Update: {
          id?: string
          is_active?: boolean
          name?: string
          rules?: Json
          thresholds?: Json
          updated_at?: string
        }
        Relationships: []
      }
      integration_logs: {
        Row: {
          action: string
          created_at: string
          detail: Json | null
          id: string
          provider: string
          status: string
        }
        Insert: {
          action: string
          created_at?: string
          detail?: Json | null
          id?: string
          provider: string
          status: string
        }
        Update: {
          action?: string
          created_at?: string
          detail?: Json | null
          id?: string
          provider?: string
          status?: string
        }
        Relationships: []
      }
      lead_interactions: {
        Row: {
          author_id: string | null
          content: string | null
          created_at: string
          external_id: string | null
          id: string
          lead_id: string
          metadata: Json | null
          type: string
        }
        Insert: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          type: string
        }
        Update: {
          author_id?: string | null
          content?: string | null
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_interactions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_meeting_invites: {
        Row: {
          briefing_message_id: string | null
          briefing_sent_at: string | null
          created_at: string
          duration_min: number
          error: string | null
          executivo_id: string | null
          handoff: string | null
          id: string
          invite_message_id: string | null
          lead_id: string
          meeting_at: string
          method: string
          sdr_id: string | null
          sequence: number
          to_emails: string[]
          uid: string
        }
        Insert: {
          briefing_message_id?: string | null
          briefing_sent_at?: string | null
          created_at?: string
          duration_min?: number
          error?: string | null
          executivo_id?: string | null
          handoff?: string | null
          id?: string
          invite_message_id?: string | null
          lead_id: string
          meeting_at: string
          method?: string
          sdr_id?: string | null
          sequence?: number
          to_emails?: string[]
          uid: string
        }
        Update: {
          briefing_message_id?: string | null
          briefing_sent_at?: string | null
          created_at?: string
          duration_min?: number
          error?: string | null
          executivo_id?: string | null
          handoff?: string | null
          id?: string
          invite_message_id?: string | null
          lead_id?: string
          meeting_at?: string
          method?: string
          sdr_id?: string | null
          sequence?: number
          to_emails?: string[]
          uid?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_meeting_invites_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          lead_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          lead_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_touches: {
        Row: {
          action_type: string
          author_id: string | null
          channel: string
          created_at: string
          follow_up_done_at: string | null
          follow_up_done_by: string | null
          id: string
          lead_id: string
          metadata: Json
          next_follow_up_at: string | null
          notes: string | null
          occurred_at: string
          outcome: string
          touch_number: number
          updated_at: string
        }
        Insert: {
          action_type: string
          author_id?: string | null
          channel: string
          created_at?: string
          follow_up_done_at?: string | null
          follow_up_done_by?: string | null
          id?: string
          lead_id: string
          metadata?: Json
          next_follow_up_at?: string | null
          notes?: string | null
          occurred_at?: string
          outcome: string
          touch_number?: number
          updated_at?: string
        }
        Update: {
          action_type?: string
          author_id?: string | null
          channel?: string
          created_at?: string
          follow_up_done_at?: string | null
          follow_up_done_by?: string | null
          id?: string
          lead_id?: string
          metadata?: Json
          next_follow_up_at?: string | null
          notes?: string | null
          occurred_at?: string
          outcome?: string
          touch_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_touches_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ad_name: string | null
          approach_result: string | null
          assigned_to: string | null
          bant: Json
          cadence_started_at: string | null
          cadence_status: string
          cadence_track: string | null
          campaign: string | null
          channel: string | null
          company_description: string | null
          company_id: string | null
          company_linkedin: string | null
          company_location: string | null
          company_name: string | null
          company_segment: string | null
          company_size: string | null
          company_summary: string | null
          company_website: string | null
          converted_at: string | null
          created_at: string
          deal_id: string | null
          demo_free: boolean | null
          email: string | null
          enriched_at: string | null
          enrichment_status: Database["public"]["Enums"]["enrichment_status"]
          executivo_id: string | null
          exemplo: boolean
          first_approach_at: string | null
          form_name: string | null
          form_payload: Json | null
          icp_signals: Json | null
          id: string
          last_action_at: string | null
          last_touch_at: string | null
          last_touch_channel: string | null
          last_touch_outcome: string | null
          lead_type: string | null
          linkedin_company_size: string | null
          linkedin_url: string | null
          lost_reason: string | null
          meeting_at: string | null
          meeting_booked_at: string | null
          meeting_duration_min: number | null
          meeting_handoff: string | null
          meeting_invite_sent_at: string | null
          meeting_invite_sequence: number
          meeting_invite_uid: string | null
          name: string
          next_action: string | null
          next_follow_up_at: string | null
          oculto_sdr: boolean
          original_company_name: string | null
          phone: string | null
          position: string | null
          priority: Database["public"]["Enums"]["lead_priority"]
          probable_pain: string | null
          rd_contact_id: string | null
          rd_deal_id: string | null
          rd_org_id: string | null
          rd_owner: string | null
          rd_pipeline: string | null
          rd_status: string | null
          score: number
          source: string | null
          stage_entered_at: string | null
          stage_id: string | null
          touch_count: number
          updated_at: string
        }
        Insert: {
          ad_name?: string | null
          approach_result?: string | null
          assigned_to?: string | null
          bant?: Json
          cadence_started_at?: string | null
          cadence_status?: string
          cadence_track?: string | null
          campaign?: string | null
          channel?: string | null
          company_description?: string | null
          company_id?: string | null
          company_linkedin?: string | null
          company_location?: string | null
          company_name?: string | null
          company_segment?: string | null
          company_size?: string | null
          company_summary?: string | null
          company_website?: string | null
          converted_at?: string | null
          created_at?: string
          deal_id?: string | null
          demo_free?: boolean | null
          email?: string | null
          enriched_at?: string | null
          enrichment_status?: Database["public"]["Enums"]["enrichment_status"]
          executivo_id?: string | null
          exemplo?: boolean
          first_approach_at?: string | null
          form_name?: string | null
          form_payload?: Json | null
          icp_signals?: Json | null
          id?: string
          last_action_at?: string | null
          last_touch_at?: string | null
          last_touch_channel?: string | null
          last_touch_outcome?: string | null
          lead_type?: string | null
          linkedin_company_size?: string | null
          linkedin_url?: string | null
          lost_reason?: string | null
          meeting_at?: string | null
          meeting_booked_at?: string | null
          meeting_duration_min?: number | null
          meeting_handoff?: string | null
          meeting_invite_sent_at?: string | null
          meeting_invite_sequence?: number
          meeting_invite_uid?: string | null
          name: string
          next_action?: string | null
          next_follow_up_at?: string | null
          oculto_sdr?: boolean
          original_company_name?: string | null
          phone?: string | null
          position?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          probable_pain?: string | null
          rd_contact_id?: string | null
          rd_deal_id?: string | null
          rd_org_id?: string | null
          rd_owner?: string | null
          rd_pipeline?: string | null
          rd_status?: string | null
          score?: number
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          touch_count?: number
          updated_at?: string
        }
        Update: {
          ad_name?: string | null
          approach_result?: string | null
          assigned_to?: string | null
          bant?: Json
          cadence_started_at?: string | null
          cadence_status?: string
          cadence_track?: string | null
          campaign?: string | null
          channel?: string | null
          company_description?: string | null
          company_id?: string | null
          company_linkedin?: string | null
          company_location?: string | null
          company_name?: string | null
          company_segment?: string | null
          company_size?: string | null
          company_summary?: string | null
          company_website?: string | null
          converted_at?: string | null
          created_at?: string
          deal_id?: string | null
          demo_free?: boolean | null
          email?: string | null
          enriched_at?: string | null
          enrichment_status?: Database["public"]["Enums"]["enrichment_status"]
          executivo_id?: string | null
          exemplo?: boolean
          first_approach_at?: string | null
          form_name?: string | null
          form_payload?: Json | null
          icp_signals?: Json | null
          id?: string
          last_action_at?: string | null
          last_touch_at?: string | null
          last_touch_channel?: string | null
          last_touch_outcome?: string | null
          lead_type?: string | null
          linkedin_company_size?: string | null
          linkedin_url?: string | null
          lost_reason?: string | null
          meeting_at?: string | null
          meeting_booked_at?: string | null
          meeting_duration_min?: number | null
          meeting_handoff?: string | null
          meeting_invite_sent_at?: string | null
          meeting_invite_sequence?: number
          meeting_invite_uid?: string | null
          name?: string
          next_action?: string | null
          next_follow_up_at?: string | null
          oculto_sdr?: boolean
          original_company_name?: string | null
          phone?: string | null
          position?: string | null
          priority?: Database["public"]["Enums"]["lead_priority"]
          probable_pain?: string | null
          rd_contact_id?: string | null
          rd_deal_id?: string | null
          rd_org_id?: string | null
          rd_owner?: string | null
          rd_pipeline?: string | null
          rd_status?: string | null
          score?: number
          source?: string | null
          stage_entered_at?: string | null
          stage_id?: string | null
          touch_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          cor: string | null
          id: string
          kind: string
          nome: string
          ordem: number
          pipeline_id: string
          probabilidade: number
          slug: string
        }
        Insert: {
          cor?: string | null
          id?: string
          kind?: string
          nome: string
          ordem?: number
          pipeline_id: string
          probabilidade?: number
          slug: string
        }
        Update: {
          cor?: string | null
          id?: string
          kind?: string
          nome?: string
          ordem?: number
          pipeline_id?: string
          probabilidade?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          slug: string
          tipo: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          slug: string
          tipo: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          slug?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          ativo: boolean
          categoria: string | null
          created_at: string
          id: string
          nome: string
          rd_product_id: string | null
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome: string
          rd_product_id?: string | null
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          created_at?: string
          id?: string
          nome?: string
          rd_product_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rd_contacts: {
        Row: {
          created_at: string
          email: string | null
          linkedin_url: string | null
          name: string
          owner_name: string | null
          phone: string | null
          position: string | null
          raw: Json
          rd_id: string
          rd_org_id: string | null
          rd_org_name: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          linkedin_url?: string | null
          name: string
          owner_name?: string | null
          phone?: string | null
          position?: string | null
          raw?: Json
          rd_id: string
          rd_org_id?: string | null
          rd_org_name?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          linkedin_url?: string | null
          name?: string
          owner_name?: string | null
          phone?: string | null
          position?: string | null
          raw?: Json
          rd_id?: string
          rd_org_id?: string | null
          rd_org_name?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rd_deals: {
        Row: {
          amount: number | null
          campaign_name: string | null
          created_at: string
          name: string
          owner_name: string | null
          pipeline: string | null
          raw: Json
          rd_contact_id: string | null
          rd_created_at: string | null
          rd_id: string
          rd_org_id: string | null
          rd_org_name: string | null
          source_name: string | null
          stage: string | null
          status: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          campaign_name?: string | null
          created_at?: string
          name: string
          owner_name?: string | null
          pipeline?: string | null
          raw?: Json
          rd_contact_id?: string | null
          rd_created_at?: string | null
          rd_id: string
          rd_org_id?: string | null
          rd_org_name?: string | null
          source_name?: string | null
          stage?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          campaign_name?: string | null
          created_at?: string
          name?: string
          owner_name?: string | null
          pipeline?: string | null
          raw?: Json
          rd_contact_id?: string | null
          rd_created_at?: string | null
          rd_id?: string
          rd_org_id?: string | null
          rd_org_name?: string | null
          source_name?: string | null
          stage?: string | null
          status?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      rd_oauth_tokens: {
        Row: {
          access_token: string
          connected_at: string
          connected_by: string | null
          expires_at: string
          id: boolean
          refresh_token: string
          updated_at: string
        }
        Insert: {
          access_token: string
          connected_at?: string
          connected_by?: string | null
          expires_at: string
          id?: boolean
          refresh_token: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          connected_at?: string
          connected_by?: string | null
          expires_at?: string
          id?: boolean
          refresh_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      rd_organizations: {
        Row: {
          cnpj: string | null
          created_at: string
          lifecycle: string | null
          name: string
          owner_name: string | null
          raw: Json
          rd_id: string
          segment: string | null
          site_url: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          lifecycle?: string | null
          name: string
          owner_name?: string | null
          raw?: Json
          rd_id: string
          segment?: string | null
          site_url?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          lifecycle?: string | null
          name?: string
          owner_name?: string | null
          raw?: Json
          rd_id?: string
          segment?: string | null
          site_url?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_terminal: boolean
          name: string
          position: number
          slug: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name: string
          position: number
          slug: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_terminal?: boolean
          name?: string
          position?: number
          slug?: string
        }
        Relationships: []
      }
      teams: {
        Row: {
          ativo: boolean
          cor: string
          created_at: string
          created_by: string | null
          descricao: string | null
          modulo: string | null
          nome: string
          ordem: number
          slug: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cor?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          modulo?: string | null
          nome: string
          ordem?: number
          slug: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cor?: string
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          modulo?: string | null
          nome?: string
          ordem?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          interno: boolean
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          interno?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          interno?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          categoria: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          numero: number
          origem: string | null
          pipeline_id: string | null
          prioridade: string
          resolved_at: string | null
          responsavel_id: string | null
          sla_due_at: string | null
          stage_id: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          numero?: number
          origem?: string | null
          pipeline_id?: string | null
          prioridade?: string
          resolved_at?: string | null
          responsavel_id?: string | null
          sla_due_at?: string | null
          stage_id?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          numero?: number
          origem?: string | null
          pipeline_id?: string | null
          prioridade?: string
          resolved_at?: string | null
          responsavel_id?: string | null
          sla_due_at?: string | null
          stage_id?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_teams: {
        Row: {
          access: string[]
          created_at: string
          id: string
          team: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access?: string[]
          created_at?: string
          id?: string
          team: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access?: string[]
          created_at?: string
          id?: string
          team?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_teams_team_fkey"
            columns: ["team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["slug"]
          },
        ]
      }
      weekly_digests: {
        Row: {
          content_html: string
          content_summary: string | null
          created_at: string
          error_message: string | null
          id: string
          sent_at: string | null
          stats: Json
          status: string
          subject: string
          updated_at: string
          week_start: string
        }
        Insert: {
          content_html: string
          content_summary?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          stats?: Json
          status?: string
          subject: string
          updated_at?: string
          week_start: string
        }
        Update: {
          content_html?: string
          content_summary?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          sent_at?: string | null
          stats?: Json
          status?: string
          subject?: string
          updated_at?: string
          week_start?: string
        }
        Relationships: []
      }
      whatsapp_accounts: {
        Row: {
          access_token: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          lead_type_scope: string[] | null
          metadata: Json
          owner_user_id: string | null
          phone_number: string
          provider: string
          provider_base_url: string | null
          provider_instance_id: string | null
          status: string
          updated_at: string
          visible_to_user_ids: string[] | null
          webhook_secret: string
        }
        Insert: {
          access_token?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          lead_type_scope?: string[] | null
          metadata?: Json
          owner_user_id?: string | null
          phone_number: string
          provider?: string
          provider_base_url?: string | null
          provider_instance_id?: string | null
          status?: string
          updated_at?: string
          visible_to_user_ids?: string[] | null
          webhook_secret?: string
        }
        Update: {
          access_token?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          lead_type_scope?: string[] | null
          metadata?: Json
          owner_user_id?: string | null
          phone_number?: string
          provider?: string
          provider_base_url?: string | null
          provider_instance_id?: string | null
          status?: string
          updated_at?: string
          visible_to_user_ids?: string[] | null
          webhook_secret?: string
        }
        Relationships: []
      }
      whatsapp_automation_logs: {
        Row: {
          created_at: string
          error: string | null
          executed_at: string | null
          id: string
          lead_id: string | null
          message_id: string | null
          rule_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          rule_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          lead_id?: string | null
          message_id?: string | null
          rule_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automation_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_logs_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_automation_rules: {
        Row: {
          account_id: string | null
          active: boolean
          created_at: string
          created_by: string | null
          delay_minutes: number
          id: string
          name: string
          template_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_minutes?: number
          id?: string
          name: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          created_at?: string
          created_by?: string | null
          delay_minutes?: number
          id?: string
          name?: string
          template_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_automation_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_automation_rules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaign_messages: {
        Row: {
          campaign_id: string
          created_at: string
          error: string | null
          id: string
          lead_id: string
          message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          error?: string | null
          id?: string
          lead_id: string
          message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          error?: string | null
          id?: string
          lead_id?: string
          message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaign_messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaign_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_campaigns: {
        Row: {
          account_id: string | null
          audience_filters: Json
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          audience_filters?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          audience_filters?: Json
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_contacts: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          lead_id: string | null
          name: string | null
          opt_in: boolean
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          name?: string | null
          opt_in?: boolean
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          lead_id?: string | null
          name?: string | null
          opt_in?: boolean
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_conversations: {
        Row: {
          account_id: string | null
          ai_summary: string | null
          ai_summary_at: string | null
          assigned_user_id: string | null
          assumed_at: string | null
          assumed_by_user_id: string | null
          contact_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          last_preview: string | null
          lead_id: string
          status: string
          temperature: string | null
          temperature_at: string | null
          temperature_reason: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          ai_summary?: string | null
          ai_summary_at?: string | null
          assigned_user_id?: string | null
          assumed_at?: string | null
          assumed_by_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_preview?: string | null
          lead_id: string
          status?: string
          temperature?: string | null
          temperature_at?: string | null
          temperature_reason?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          ai_summary?: string | null
          ai_summary_at?: string | null
          assigned_user_id?: string | null
          assumed_at?: string | null
          assumed_by_user_id?: string | null
          contact_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_preview?: string | null
          lead_id?: string
          status?: string
          temperature?: string | null
          temperature_at?: string | null
          temperature_reason?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_conversations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_fup_enrollments: {
        Row: {
          completed_at: string | null
          current_step: number
          enrolled_at: string
          id: string
          last_error: string | null
          last_step_at: string | null
          lead_id: string
          next_run_at: string | null
          sequence_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          last_error?: string | null
          last_step_at?: string | null
          lead_id: string
          next_run_at?: string | null
          sequence_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          current_step?: number
          enrolled_at?: string
          id?: string
          last_error?: string | null
          last_step_at?: string | null
          lead_id?: string
          next_run_at?: string | null
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fup_enrollments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_fup_enrollments_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_fup_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_fup_sequences: {
        Row: {
          account_id: string | null
          active: boolean
          audience_filters: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          stop_on_reply: boolean
          stop_on_stage_ids: string[]
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          audience_filters?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          stop_on_reply?: boolean
          stop_on_stage_ids?: string[]
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          audience_filters?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          stop_on_reply?: boolean
          stop_on_stage_ids?: string[]
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fup_sequences_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_fup_steps: {
        Row: {
          created_at: string
          delay_hours: number
          id: string
          sequence_id: string
          step_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          delay_hours?: number
          id?: string
          sequence_id: string
          step_order: number
          template_id: string
        }
        Update: {
          created_at?: string
          delay_hours?: number
          id?: string
          sequence_id?: string
          step_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fup_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_fup_sequences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_fup_steps_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          error: string | null
          id: string
          lead_id: string
          media_mime: string | null
          media_url: string | null
          message_type: string
          metadata: Json
          provider_message_id: string | null
          read_at: string | null
          sender_type: string
          sender_user_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          lead_id: string
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          provider_message_id?: string | null
          read_at?: string | null
          sender_type: string
          sender_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          id?: string
          lead_id?: string
          media_mime?: string | null
          media_url?: string | null
          message_type?: string
          metadata?: Json
          provider_message_id?: string | null
          read_at?: string | null
          sender_type?: string
          sender_user_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          body: string
          buttons: Json
          category: string | null
          created_at: string
          created_by: string | null
          footer_text: string | null
          header_text: string | null
          header_type: string | null
          id: string
          language: string
          meta_last_synced_at: string | null
          meta_template_id: string | null
          name: string
          provider_template_name: string | null
          rejection_reason: string | null
          status: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          buttons?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_last_synced_at?: string | null
          meta_template_id?: string | null
          name: string
          provider_template_name?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          buttons?: Json
          category?: string | null
          created_at?: string
          created_by?: string | null
          footer_text?: string | null
          header_text?: string | null
          header_type?: string | null
          id?: string
          language?: string
          meta_last_synced_at?: string | null
          meta_template_id?: string | null
          name?: string
          provider_template_name?: string | null
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_lead: { Args: { _lead_id: string }; Returns: boolean }
      can_access_module: {
        Args: {
          _team: Database["public"]["Enums"]["app_team"]
          _user_id: string
        }
        Returns: boolean
      }
      can_view_wa_account: { Args: { _account_id: string }; Returns: boolean }
      cs_can_see_client: { Args: { _client_uid: string }; Returns: boolean }
      cs_channel_requires_evidence: {
        Args: { _channel: string }
        Returns: boolean
      }
      cs_contact_for_phone: {
        Args: { _phone: string }
        Returns: {
          client_uid: string
          contact_id: string
        }[]
      }
      cs_escalation_config: { Args: never; Returns: Json }
      cs_escalations: {
        Args: never
        Returns: {
          acted: boolean
          client_uid: string
          days_late: number
          due_at: string
          kind: string
          last_action_at: string
          owner_id: string
          reason: string
          ref_id: string
          title: string
        }[]
      }
      cs_evidence_config: { Args: never; Returns: Json }
      cs_find_evidence: {
        Args: { _channel: string; _client_uid: string; _since: string }
        Returns: {
          event_id: string
          occurred_at: string
          title: string
        }[]
      }
      cs_gen_client_uid: { Args: never; Returns: string }
      cs_phone_digits: { Args: { _v: string }; Returns: string }
      cs_refresh_escalations: { Args: never; Returns: number }
      cs_settle_meetings: { Args: never; Returns: number }
      cs_signal_context: {
        Args: { _at: string; _client_uid: string }
        Returns: Json
      }
      cs_stage_from_contract:
        | {
            Args: { _start: string }
            Returns: Database["public"]["Enums"]["cs_journey_stage"]
          }
        | {
            Args: { _renewal?: string; _start: string }
            Returns: Database["public"]["Enums"]["cs_journey_stage"]
          }
      deal_data_ganho: {
        Args: { _deal: Database["public"]["Tables"]["deals"]["Row"] }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_team: {
        Args: {
          _team: Database["public"]["Enums"]["app_team"]
          _user_id: string
        }
        Returns: boolean
      }
      is_manager: { Args: { _user_id: string }; Returns: boolean }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      lead_is_rd_import: {
        Args: { l: Database["public"]["Tables"]["leads"]["Row"] }
        Returns: boolean
      }
      sync_user_roles: { Args: { _user_id: string }; Returns: undefined }
      team_access_types: { Args: { _modulo: string }; Returns: string[] }
    }
    Enums: {
      app_role: "super_admin" | "gestao" | "executivo" | "sdr"
      app_team: "comercial" | "cs"
      cs_client_type: "empresa" | "consultoria" | "pessoa_fisica"
      cs_contact_origin: "manual" | "email_bcc" | "pda_api" | "linkedin"
      cs_journey_stage: "onboarding" | "ativacao" | "renovacao"
      cs_origin: "marketing" | "indicacao" | "outbound" | "renovacao"
      cs_signal: "verde" | "amarelo" | "vermelho" | "sem_dado" | "preto"
      enrichment_status: "pending" | "found" | "not_found" | "manual"
      lead_priority: "alta" | "media" | "baixa" | "fora_icp" | "pendente"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "gestao", "executivo", "sdr"],
      app_team: ["comercial", "cs"],
      cs_client_type: ["empresa", "consultoria", "pessoa_fisica"],
      cs_contact_origin: ["manual", "email_bcc", "pda_api", "linkedin"],
      cs_journey_stage: ["onboarding", "ativacao", "renovacao"],
      cs_origin: ["marketing", "indicacao", "outbound", "renovacao"],
      cs_signal: ["verde", "amarelo", "vermelho", "sem_dado", "preto"],
      enrichment_status: ["pending", "found", "not_found", "manual"],
      lead_priority: ["alta", "media", "baixa", "fora_icp", "pendente"],
    },
  },
} as const
