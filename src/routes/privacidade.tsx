import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — SDR GROU" },
      {
        name: "description",
        content:
          "Como o SDR GROU coleta, usa, armazena e protege dados de leads e mensagens de WhatsApp Business.",
      },
      { property: "og:title", content: "Política de Privacidade — SDR GROU" },
      {
        property: "og:description",
        content:
          "Política de privacidade do SDR GROU: tratamento de dados de leads, mensagens de WhatsApp e direitos do titular (LGPD).",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacidadePage,
});

const UPDATED = "5 de agosto de 2026";
const CONTACT = "privacidade@grougp.com.br";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function PrivacidadePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <header className="mb-10 space-y-3 border-b border-border pb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          SDR GROU — Grou Gestão de Pessoas
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground">Última atualização: {UPDATED}</p>
      </header>

      <div className="space-y-10">
        <Section title="1. Quem somos">
          <p>
            O SDR GROU é um sistema interno de gestão comercial (CRM) operado pela Grou
            (grougp.com.br). Ele é usado pela nossa própria equipe de pré-vendas para organizar
            oportunidades e conversar com pessoas que demonstraram interesse em nossos produtos e
            serviços, incluindo o PDA International. O acesso ao sistema é restrito a colaboradores
            autorizados da Grou.
          </p>
          <p>
            Esta página é mantida pela Grou para explicar de forma clara quais dados o sistema trata.
            Ela não é uma certificação nem uma auditoria independente.
          </p>
        </Section>

        <Section title="2. Dados que tratamos">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-foreground">Dados de contato do lead:</strong> nome, e-mail,
              telefone/WhatsApp, empresa, cargo e site informados pelo próprio lead em formulários,
              anúncios, landing pages ou canais de atendimento.
            </li>
            <li>
              <strong className="text-foreground">Dados comerciais:</strong> origem/campanha do
              contato, etapa do funil, histórico de interações, anotações da equipe, agendamentos e
              follow-ups.
            </li>
            <li>
              <strong className="text-foreground">Mensagens de WhatsApp:</strong> conteúdo das
              mensagens trocadas com nossos números WhatsApp Business (texto, imagens, áudios,
              vídeos e documentos), além de metadados como data/hora e status de entrega.
            </li>
            <li>
              <strong className="text-foreground">Dados de usuários internos:</strong> nome, e-mail
              corporativo e função dos colaboradores que utilizam o sistema.
            </li>
          </ul>
          <p>
            Não coletamos intencionalmente dados sensíveis (como saúde, biometria, religião ou
            opinião política) e pedimos que não sejam enviados pelos canais de atendimento.
          </p>
        </Section>

        <Section title="3. Para que usamos os dados">
          <ul className="list-disc space-y-2 pl-5">
            <li>Responder solicitações e dar continuidade ao atendimento comercial.</li>
            <li>Qualificar oportunidades e direcionar o lead ao consultor responsável.</li>
            <li>Enviar mensagens de atendimento e follow-up pelo WhatsApp, inclusive com apoio de assistente automatizado.</li>
            <li>Organizar a operação comercial: histórico de contatos, agenda de follow-ups e indicadores internos.</li>
          </ul>
          <p>
            As bases legais aplicáveis (LGPD, Lei 13.709/2018) são o legítimo interesse na atividade
            comercial, a execução de contrato ou tratativas pré-contratuais e, quando exigido, o
            consentimento do titular.
          </p>
        </Section>

        <Section title="4. Mensagens automatizadas e WhatsApp">
          <p>
            Nossos atendimentos por WhatsApp são realizados via WhatsApp Business Platform (Meta).
            Parte das mensagens iniciais e dos follow-ups pode ser enviada de forma automatizada por
            um assistente, sempre com identificação da Grou e com possibilidade de falar com uma
            pessoa da equipe. O envio de mensagens ativas ocorre apenas para contatos que
            informaram seus dados em nossos canais.
          </p>
          <p>
            Para deixar de receber mensagens, basta responder <strong className="text-foreground">
            &quot;sair&quot;</strong> ou <strong className="text-foreground">&quot;parar&quot;</strong> na
            conversa, ou solicitar por e-mail. O contato é marcado como opt-out e o envio ativo é
            interrompido.
          </p>
        </Section>

        <Section title="5. Compartilhamento com terceiros">
          <p>
            Não vendemos dados pessoais. Compartilhamos dados apenas com prestadores que sustentam a
            operação do sistema, no limite necessário:
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>Meta Platforms — envio e recebimento de mensagens via WhatsApp Business Platform.</li>
            <li>Provedor de infraestrutura e banco de dados em nuvem, para hospedagem do sistema.</li>
            <li>Provedores de e-mail transacional, para notificações internas da equipe.</li>
            <li>Provedores de modelos de inteligência artificial, para geração de respostas de atendimento.</li>
            <li>Autoridades públicas, quando houver obrigação legal ou requisição judicial.</li>
          </ul>
        </Section>

        <Section title="6. Segurança e acesso">
          <p>
            O acesso ao sistema exige autenticação individual e é limitado a colaboradores
            autorizados. Aplicamos controles de permissão por perfil e por responsável, de modo que
            cada atendente visualize apenas as conversas e leads sob sua responsabilidade, conforme
            a configuração da operação. Os dados são transmitidos por conexões criptografadas
            (HTTPS) e armazenados em infraestrutura de nuvem com controles de acesso.
          </p>
        </Section>

        <Section title="7. Retenção e exclusão">
          <p>
            Mantemos os dados enquanto houver relacionamento comercial ativo ou interesse legítimo
            no acompanhamento da oportunidade, e pelos prazos exigidos por lei. Encerrada a
            finalidade, os dados são eliminados ou anonimizados. Solicitações de exclusão são
            atendidas conforme o item seguinte.
          </p>
        </Section>

        <Section title="8. Direitos do titular">
          <p>
            Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade,
            eliminação dos seus dados, informação sobre compartilhamentos e revogação de consentimento.
            Basta escrever para{" "}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            . Responderemos nos prazos previstos na LGPD.
          </p>
        </Section>

        <Section title="9. Alterações desta política">
          <p>
            Podemos atualizar esta política para refletir mudanças no sistema ou na legislação. A
            data da última atualização é sempre indicada no topo da página.
          </p>
        </Section>

        <Section title="10. Contato">
          <p>
            Dúvidas sobre privacidade e proteção de dados:{" "}
            <a className="font-medium text-primary underline-offset-4 hover:underline" href={`mailto:${CONTACT}`}>
              {CONTACT}
            </a>
            .
          </p>
        </Section>
      </div>
    </main>
  );
}