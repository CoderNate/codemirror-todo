open System.Net
type MemoryStream = System.IO.MemoryStream
type List<'T> = System.Collections.Generic.List<'T>

let handleRequest (ctxt: HttpListenerContext) =
    let response = ctxt.Response

    if ctxt.Request.HttpMethod = "OPTIONS" then
        response.AddHeader("Access-Control-Allow-Headers", "Content-Type, Accept, X-Requested-With")
        response.AddHeader("Access-Control-Allow-Methods", "GET, POST")
        response.AddHeader("Access-Control-Max-Age", "1728000")
    response.AppendHeader("Access-Control-Allow-Origin", "*")

    let sourcePath = System.IO.Path.Combine(__SOURCE_DIRECTORY__, @"CodeMirrorTodoList.txt")
    if ctxt.Request.HttpMethod = "GET" then
        printfn "Got request from %s" ctxt.Request.RawUrl
        response.ContentLength64 <- System.IO.FileInfo(sourcePath).Length
        use fs = System.IO.File.OpenRead(sourcePath)
        fs.CopyTo(response.OutputStream)

    let withSaveFile (doWrite: System.IO.FileStream -> unit) =
        let tempPath = sourcePath + "-TEMP"
        (
            use tempFs = System.IO.File.OpenWrite(tempPath)
            doWrite tempFs
        )
        System.IO.File.Delete sourcePath
        System.IO.File.Move(tempPath, sourcePath)

    if ctxt.Request.HttpMethod = "POST" && ctxt.Request.RawUrl = "/save" then
        printfn "Got POST request from %s" ctxt.Request.RawUrl
        withSaveFile (fun fs -> ctxt.Request.InputStream.CopyTo(fs))
        ctxt.Response.Close()

    if ctxt.Request.HttpMethod = "POST" && ctxt.Request.RawUrl.StartsWith("/openurl/") then
        printfn "Got POST request from %s" ctxt.Request.RawUrl
        let url = System.Web.HttpUtility.UrlDecode(ctxt.Request.RawUrl.Substring("/openurl/".Length))
        let _ =
            System.Diagnostics.Process.Start(
                System.Diagnostics.ProcessStartInfo(url, UseShellExecute = true))
        ctxt.Response.Close()

    if ctxt.Request.HttpMethod = "POST" && ctxt.Request.RawUrl = "/doupdates" then
        raise (System.NotImplementedException "/doupdates not implemented.")

let run() =
    use listener = new HttpListener()
    listener.Prefixes.Add "http://localhost:8675/"
    listener.Start()
    while true do
        let ctxt = listener.GetContext()
        try handleRequest ctxt
        with | ex ->
            printfn "Error handling request: %A" ex
            ctxt.Response.StatusCode <- (int HttpStatusCode.InternalServerError)
            ctxt.Response.Close()

run()

