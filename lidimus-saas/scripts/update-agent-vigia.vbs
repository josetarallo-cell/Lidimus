' Vigia do agente do Lidimus Update: ressobe se a porta 8099 parar de responder.
'
' O agente sobe por um atalho em Inicializar, o que significa que ele só existe
' depois do logon interativo — e que, se morrer no meio do dia, ninguém percebe
' até as 5h da manhã seguinte, quando o WhatsApp avisa que "o agente do host nao
' respondeu" e a promoção do dia se perde.
'
' Registrado como tarefa agendada "Lidimus Update - vigia", a cada 15 minutos,
' na conta do usuário (/IT). Não pode rodar como SYSTEM: o processo que ele sobe
' precisa do perfil carregado para o Git Credential Manager achar a credencial
' do GitHub.

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

pastaScripts = fso.GetParentFolderName(WScript.ScriptFullName)
agente = pastaScripts & "\update-agent-oculto.vbs"

estado = 0
On Error Resume Next
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.setTimeouts 2000, 2000, 4000, 4000
http.open "GET", "http://127.0.0.1:8099/status", False
http.send
estado = http.status
If Err.Number <> 0 Then estado = 0
On Error GoTo 0

' Qualquer resposta HTTP serve como prova de vida — inclusive 401, que é o que
' esta chamada sem token deve receber. Só a ausência de resposta (estado 0,
' conexão recusada) significa agente fora do ar.
If estado = 0 Then
  caminhoLog = fso.GetParentFolderName(pastaScripts)
  caminhoLog = fso.GetParentFolderName(caminhoLog) & "\tmp\update-agent.log"
  If fso.FileExists(caminhoLog) Then
    Set arq = fso.OpenTextFile(caminhoLog, 8, True)
    arq.WriteLine "[" & Now & "] vigia: agente nao respondeu na 8099, ressubindo"
    arq.Close
  End If
  sh.Run "wscript.exe """ & agente & """", 0, False
End If
