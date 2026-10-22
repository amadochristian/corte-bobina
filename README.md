# Santher | Controle de Refugo

Aplicativo web mobile-first para registrar lotes totalmente cortados e consultar lançamentos e indicadores da planilha de produção. O front-end é estático (HTML, CSS e módulos JavaScript); a API usa funções Node.js da Vercel; o Google Apps Script acessa a planilha sem expor credenciais ao navegador.

> A tela só confirma um lançamento após receber confirmação da API. A interface pode abrir com recursos em cache, mas não grava offline. As ilustrações de bobinas são referências genéricas, não representam medidas nem padrões oficiais. O sistema é uma ferramenta interna em desenvolvimento e não representa aprovação corporativa.

## Estrutura

- `index.html`, `css/`, `js/`: PWA estático, formulário, histórico, filtros e indicadores.
- `api/`: endpoints `GET /api/health`, `GET /api/records` e `POST /api/records`.
- `lib/apps-script.js`: validação e chamada server-side ao adaptador.
- `google-apps-script/Code.gs`: validação, leitura e escrita da planilha.
- `manifest.webmanifest`, `sw.js`: instalação e cache somente do app shell; respostas da API nunca são cacheadas.
- `assets/images/bobinas/`: ilustrações temporárias comparativas. Substitua-as por referências autorizadas quando disponíveis.

O logotipo real não foi fornecido. Coloque o arquivo autorizado em `assets/images/logo.png`; até lá, o espaço do logotipo fica oculto (não há logotipo substituto). Os cabeçalhos esperados na primeira linha da aba são, nesta ordem: `Data`, `RE do colaborador`, `Material`, `Tamanho`, `Dificuldade`, `Quantidade`.

## Executar localmente

Requer Node.js 18 ou mais recente e a CLI da Vercel. Na pasta do projeto:

1. Copie `.env.example` para `.env.local` e preencha os valores após configurar o Apps Script.
2. Instale a CLI da Vercel, se ainda não estiver disponível: `npm install --global vercel`.
3. Execute `vercel dev` e abra o endereço indicado pela CLI.

Não abra `index.html` diretamente como arquivo: módulos, service worker e rotas `/api` precisam de um servidor. Sem as variáveis e a implantação do Apps Script, a aplicação apresenta a indisponibilidade da API; não há dados de demonstração.

## Conectar a planilha existente

1. Abra a planilha no Google Drive. Copie o ID da URL, entre `/d/` e `/edit`. O ID é uma configuração, não um mecanismo de autorização.
2. Confirme o nome exato da aba de lançamentos e que a primeira linha tem os seis cabeçalhos acima, sem alterar a ordem.
3. Não habilite edição pública da planilha. O proprietário precisa autorizar o Apps Script a acessá-la.
4. A conta que publica o script deve ter acesso à planilha; a configuração da implantação deve permitir a chamada server-side pela Vercel sem tornar a planilha editável pelo público. Revise as políticas da organização antes de publicar. Não use credenciais de funcionário no código.

## Configurar Google Apps Script

1. Crie um projeto em [script.google.com](https://script.google.com/) e copie `google-apps-script/Code.gs` para o editor.
2. Em **Configurações do projeto**, defina o fuso horário como `America/Sao_Paulo`.
3. Em **Configurações do projeto > Propriedades do script**, crie:
   - `SPREADSHEET_ID`: ID copiado da planilha.
   - `SHEET_NAME`: nome exato da aba que contém os registros.
   - `INTEGRATION_TOKEN`: segredo aleatório longo, exclusivo e não versionado.
4. Execute uma função de teste no editor para conceder as permissões necessárias à planilha. O script verifica cabeçalhos e falha sem criar uma aba quando a configuração não corresponde.
5. Publique como **Aplicativo da web**, com acesso compatível com a chamada server-to-server aprovada pela organização. Se a política exigir autenticação Google que não funcione com a chamada anônima da Vercel, interrompa a implantação e defina uma arquitetura corporativa autorizada; não torne a planilha pública para contornar isso.
6. Copie a URL `/exec` da implantação para `APPS_SCRIPT_URL`. Após qualquer alteração no código, atualize a implantação.

O Apps Script recebe somente operações autenticadas por `INTEGRATION_TOKEN`. A data é gerada no servidor via `Utilities.formatDate` no fuso indicado e salva como texto fixo `yyyy-MM-dd`, não como fórmula. O mecanismo de idempotência usa `ScriptLock` e cache por seis horas: reduz duplicações em reenvios com o mesmo identificador durante essa janela, mas não oferece deduplicação permanente.

## Vercel e variáveis de ambiente

Configure no projeto Vercel, em **Settings > Environment Variables**, e também localmente em `.env.local`:

| Variável | Conteúdo |
| --- | --- |
| `APPS_SCRIPT_URL` | URL HTTPS `/exec` da implantação do Apps Script |
| `INTEGRATION_TOKEN` | Mesmo segredo definido nas propriedades do Apps Script |

Configure o projeto para servir esta pasta como aplicação estática com as funções da pasta `api/` e publique com `vercel`. Não coloque o segredo em arquivos públicos, no navegador ou em variáveis com prefixo `VITE_`/`NEXT_PUBLIC_`. `.env.local` é ignorado pelo Git.

**Controle de acesso:** o token protege a comunicação com o Apps Script, mas não autentica usuários da interface nem impede, sozinho, que terceiros chamem os endpoints públicos da Vercel. Antes de registrar dados reais, aplique a autenticação/controle de acesso aprovado pela Santher na camada de publicação ou diante da API e confirme que o fluxo mobile consegue usá-lo. Não publique o endpoint de gravação desprotegido para uso industrial. A aplicação não inventa uma política de identidade corporativa.

O endpoint de leitura aceita `from`, `to` (datas `YYYY-MM-DD`), `re`, `material`, `size` e `difficulty`, inclusive combinados. Retorna no máximo 5.000 registros ordenados do mais recente ao mais antigo; a resposta marca quando o limite foi excedido. Filtre o período para calcular indicadores de um conjunto delimitado. A aba deve permanecer restrita; os dados são fornecidos somente via API.

## PWA

Publique com HTTPS. No Android, abra a URL no Chrome e escolha **Instalar app** ou **Adicionar à tela inicial**. No desktop compatível, use o ícone/opção **Instalar** do navegador. O service worker mantém somente os arquivos estáticos necessários ao app shell e remove caches antigos na ativação; endpoints e dados de produção nunca são armazenados nele. Sem conexão, a interface em cache pode abrir, mas leitura e gravação não são prometidas.

O manifesto usa um ícone SVG adaptável. Adicione ícones PNG em tamanhos específicos se a política/dispositivo de publicação exigir esse formato.

## Regras e limites conhecidos

- A aba mantém as seis colunas existentes e não recebe campos adicionais.
- RE é tratado como texto numérico, preservando zeros à esquerda. Não se presume um padrão de RE além de dígitos.
- RU, tamanho e dificuldade são seleções independentes; quantidade é qualquer inteiro positivo seguro.
- Os indicadores somam `Quantidade`, não o número de linhas.
- Linhas com data/formato/classificação/quantidade inválidos são omitidas da leitura; revise dados legados da planilha se os totais não baterem.
- Requisições em gravação não são repetidas automaticamente. Se a resposta ficar incerta, tente novamente com os mesmos dados; o navegador reutiliza o identificador enquanto os valores permanecerem iguais.
- A idempotência é temporária (cache de seis horas), não uma garantia permanente contra duplicidade.
- Não é possível confirmar a conexão com a planilha ou a autorização corporativa sem os valores, permissões e implantação fornecidos pelo responsável.
