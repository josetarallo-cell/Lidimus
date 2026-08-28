' Sobe o agente do Lidimus Update sem abrir janela de console.
'
' O atalho em Inicializar (Startup) aponta para cá em vez de chamar o node
' direto, porque isso abriria um console visível a cada login. O terceiro
' argumento do Run (0) é o que esconde a janela.
'
' PRECISA rodar na conta do usuário com o perfil carregado: o Git Credential
' Manager guarda a credencial do GitHub no perfil, e um processo como SYSTEM
' não a enxerga — o `git push` do deploy falharia todo dia às 5h. É por isso que
' isto vive em Inicializar, e não numa tarefa agendada como SYSTEM.

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' scripts/ -> lidimus-saas/
raizSaas = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
' `log` não serve como nome de variável: é função interna do VBScript.
caminhoLog = fso.GetParentFolderName(raizSaas) & "\tmp\update-agent.log"

pastaTmp = fso.GetParentFolderName(caminhoLog)
If Not fso.FolderExists(pastaTmp) Then fso.CreateFolder(pastaTmp)

' Rotação. O arquivo é aberto em modo append pelo redirecionamento abaixo e só
' cresce: sem isto ele nunca é truncado, e a única forma de ler o que aconteceu
' num deploy é rolar um arquivo que não para de aumentar. Uma geração basta —
' o histórico estruturado por execução mora em .lidimus/historico/.
If fso.FileExists(caminhoLog) Then
  If fso.GetFile(caminhoLog).Size > 2097152 Then
    If fso.FileExists(caminhoLog & ".1") Then fso.DeleteFile caminhoLog & ".1"
    fso.MoveFile caminhoLog, caminhoLog & ".1"
  End If
End If

sh.CurrentDirectory = raizSaas
sh.Run "cmd /c node scripts\update-agent.mjs >> """ & caminhoLog & """ 2>&1", 0, False
