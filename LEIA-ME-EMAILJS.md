# Alerta de novo pedido por e-mail (EmailJS)

Quando um cliente finaliza um pedido, o site manda um e-mail para você com
cliente, WhatsApp (com link direto), peças, total e endereço.

## 1) Criar a conta (grátis: 200 e-mails/mês)
1. Entre em https://www.emailjs.com e crie uma conta.
2. **Email Services > Add New Service** > escolha Gmail > conecte `lojacg.vendas@gmail.com`.
   Anote o **Service ID** (ex.: `service_abc123`).

## 2) Criar o modelo do e-mail
Em **Email Templates > Create New Template**:

- **To email:** `lojacg.vendas@gmail.com`
- **Subject:** `Novo pedido de {{cliente}} — {{total}}`
- **Content:**

```
Novo pedido no site!

Cliente: {{cliente}}
WhatsApp: {{whatsapp}}
Chamar agora: {{whatsapp_link}}
Endereço: {{endereco}}

Peças ({{qtd_pecas}}):
{{pecas}}

Total: {{total}}
Observações: {{observacoes}}
Recebido em: {{data}}

Abrir a gestão: {{link_gestao}}
```
Anote o **Template ID** (ex.: `template_xyz789`).

## 3) Colar as chaves no site
Em **Account > General** copie a **Public Key** e preencha em `js/config.js`:

```js
const EMAILJS_CONFIG = {
  publicKey: "SUA_PUBLIC_KEY",
  serviceId: "service_abc123",
  templateId: "template_xyz789",
};
```

## 4) Proteger (importante)
Em **Account > Security**, coloque o domínio do seu site em *Allowed domains*.
Assim ninguém consegue usar sua chave em outro lugar para gastar sua cota.

## Testar
Faça um pedido de teste em `pedido.html`. O e-mail chega em segundos.
Se as chaves estiverem vazias, o alerta fica desligado e nada muda no site.
Se o e-mail falhar, o pedido continua salvo normalmente na Gestão.
