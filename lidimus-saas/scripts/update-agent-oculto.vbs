' Sobe o agente do Lidimus Update sem abrir janela de console.
'
' A tarefa agendada do Windows aponta para cá em vez de chamar o node direto,
' porque uma tarefa ONLOGON abre um console visível a cada login. O terceiro
' argumento do Run (0) é o que esconde a janela.
'
' A tarefa PRECISA rodar na conta do usuário com o perfil carregado: o Git
' Credential Manager guarda a credencial do GitHub no perfil, e uma tarefa como
' SYSTEM não a enxerga — o `git push` do deploy falharia todo dia às 5h.

Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")

' scripts/ -> lidimus-saas/
raizSaas = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
' `log` não serve como nome de variável: é função interna do VBScript.
caminhoLog = fso.GetParentFolderName(raizSaas) & "\tmp\update-agent.log"

sh.CurrentDirectory = raizSaas
sh.Run "cmd /c node scripts\update-agent.mjs >> """ & caminhoLog & """ 2>&1", 0, False
