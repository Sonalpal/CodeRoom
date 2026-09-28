import * as Y from 'yjs'
import { useState,useRef ,useMemo} from "react";
import { Editor } from "@monaco-editor/react"
import { MonacoBinding } from 'y-monaco'
import "./App.css";
import { SocketIOProvider } from "y-socket.io"

function App() {

  const editorRef = useRef(null)
  const [count, setCount] = useState(0);

  
  const ydoc = useMemo(() => new Y.Doc(), [])
  const yText = useMemo(() => ydoc.getText("monaco"), [ ydoc ])

  const handleMount = (editor) => {
    editorRef.current = editor

    const provider= new SocketIOProvider("http://localhost:3000","monaco",ydoc,{autoConnect:true})


    new MonacoBinding(
      yText,
      editorRef.current.getModel(),
      new Set([ editorRef.current ]),
      provider.awareness
    )
  }

  return (
    <>
       <main
      className="h-screen w-full bg-gray-950 flex gap-4 p-4"
    >
      <aside
        className="h-full w-1/4 bg-amber-50 rounded-lg "
      >
           </aside>
      <section
        className="w-3/4 bg-neutral-800 rounded-lg overflow-hidden">
        <Editor
          height="100%"
          defaultLanguage="javascript"
          defaultValue="// some comment"
          theme="vs-dark"
          onMount={handleMount}
        />
      </section>
      </main>

    </>
  );
}

export default App;
