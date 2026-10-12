import * as Y from "yjs";
import { useState, useMemo, useEffect, useRef } from "react";
import { Editor } from "@monaco-editor/react";
import { MonacoBinding } from "y-monaco";
import { SocketIOProvider } from "y-socket.io";
import { io } from "socket.io-client";
import "./App.css";

const ROOM_REGEX = /^[a-z0-9-]{1,32}$/;

const LANGUAGES = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "cpp", label: "C++" },
  { id: "c", label: "C" },
  { id: "csharp", label: "C#" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "php", label: "PHP" },
  { id: "html", label: "HTML" },
  { id: "css", label: "CSS" },
  { id: "json", label: "JSON" },
  { id: "sql", label: "SQL" },
  { id: "markdown", label: "Markdown" },
];
const DEFAULT_LANGUAGE = "javascript";

const generateRoomId = () => Math.random().toString(36).slice(2, 8);

function App() {
  const [username, setUsername] = useState(""); // set only after the server accepts it
  const [room, setRoom] = useState(""); // set only after the server accepts it
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [users, setUsers] = useState([]);
  const [editor, setEditor] = useState(null);
  const [provider, setProvider] = useState(null);
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  const nameSocketRef = useRef(null); // keeps your username reserved while connected
  const ydoc = useMemo(() => new Y.Doc(), []);
  const ymeta = useMemo(() => ydoc.getMap("meta"), [ydoc]); // shared room settings

  // Pre-fill the room input if the link has ?room=...
  const suggestedRoom =
    new URLSearchParams(window.location.search).get("room") || "";

  // Release the reserved username when the page/component goes away
  useEffect(() => {
    return () => {
      nameSocketRef.current?.disconnect();
      nameSocketRef.current = null;
    };
  }, []);

  // Keep the language in sync with the shared room setting (changes from anyone)
  useEffect(() => {
    const syncLanguage = () => {
      const value = ymeta.get("language");
      setLanguage(
        LANGUAGES.some((lang) => lang.id === value) ? value : DEFAULT_LANGUAGE,
      );
    };

    ymeta.observe(syncLanguage);
    syncLanguage();

    return () => ymeta.unobserve(syncLanguage);
  }, [ymeta]);

  const handleLanguageChange = (e) => {
    // Writing to the shared map updates everyone in the room
    ymeta.set("language", e.target.value);
  };

  // Ask the server to reserve a username inside a room. Resolves { ok, error }.
  const reserveUsername = (name, roomId) =>
    new Promise((resolve) => {
      nameSocketRef.current?.disconnect();

      const socket = io();
      nameSocketRef.current = socket;

      const fail = (message) => {
        socket.disconnect();
        nameSocketRef.current = null;
        resolve({ ok: false, error: message });
      };

      const onConnectError = () =>
        fail("Cannot reach the server. Please try again.");
      socket.once("connect_error", onConnectError);

      socket.emit("join", { username: name, room: roomId }, (res) => {
        socket.off("connect_error", onConnectError);
        if (res && res.ok) {
          resolve({ ok: true });
        } else {
          fail((res && res.error) || "Could not join");
        }
      });
    });

  const handleJoin = async (e) => {
    e.preventDefault();
    const name = e.target.username.value.trim();
    const typedRoom = e.target.room.value.trim().toLowerCase();
    if (!name || joining) return;

    // Empty room box = create a brand new room
    const roomId = typedRoom || generateRoomId();

    if (!ROOM_REGEX.test(roomId)) {
      setError("Room code can only use letters, numbers and dashes");
      return;
    }

    setError("");
    setJoining(true);
    const result = await reserveUsername(name, roomId);
    setJoining(false);

    if (result.ok) {
      setUsername(name);
      setRoom(roomId);
      window.history.pushState({}, "", "?room=" + encodeURIComponent(roomId));
    } else {
      setError(result.error);
    }
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(room)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  };

  // Leaving = reload the page without ?room= (this also frees your username)
  const handleLeave = () => {
    window.location.href = window.location.pathname;
  };

  // 1) ONE provider per session: connects to the room and tracks who is online
  useEffect(() => {
    if (!username || !room) return;

    const newProvider = new SocketIOProvider("/", room, ydoc, {
      autoConnect: true,
    });

    newProvider.awareness.setLocalStateField("user", { username });

    const updateUsers = () => {
      const states = Array.from(newProvider.awareness.getStates().values());
      setUsers(
        states
          .filter((state) => state.user && state.user.username)
          .map((state) => state.user),
      );
    };

    newProvider.awareness.on("change", updateUsers);
    updateUsers();
    setProvider(newProvider);

    const handleBeforeUnload = () => {
      newProvider.awareness.setLocalState(null);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      newProvider.awareness.off("change", updateUsers);
      newProvider.awareness.setLocalState(null);
      newProvider.disconnect();
      setProvider(null);
    };
  }, [username, room, ydoc]);

  // 2) Bind the editor text to Yjs once BOTH the editor and provider exist
  useEffect(() => {
    if (!editor || !provider) return;

    const binding = new MonacoBinding(
      ydoc.getText("monaco"),
      editor.getModel(),
      new Set([editor]),
      provider.awareness,
    );

    return () => binding.destroy();
  }, [editor, provider, ydoc]);

  if (!username || !room) {
    return (
      <main className="h-screen w-full bg-gray-950 flex gap-4 p-4 items-center justify-center">
        <form onSubmit={handleJoin} className="flex flex-col gap-4 w-80">
          <h1 className="text-white text-2xl font-bold">Collaborative Editor</h1>
          <input
            type="text"
            placeholder="Enter your username"
            className="p-2 rounded-lg bg-gray-800 text-white"
            name="username"
            maxLength={20}
            autoFocus
          />
          <input
            type="text"
            placeholder="Room code (leave empty to create a new room)"
            className="p-2 rounded-lg bg-gray-800 text-white"
            name="room"
            maxLength={32}
            defaultValue={suggestedRoom}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            disabled={joining}
            className="p-2 rounded-lg bg-amber-50 text-gray-950 font-bold disabled:opacity-60"
          >
            {joining ? "Joining..." : "Join"}
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="h-screen w-full bg-gray-950 flex gap-4 p-4">
      <aside className="h-full w-1/4 bg-amber-50 rounded-lg flex flex-col">
        <div className="p-4 border-b border-gray-300">
          <p className="text-sm text-gray-600">Room</p>
          <p className="text-xl font-bold break-all">{room}</p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleCopyLink}
              className="flex-1 p-2 rounded-lg bg-gray-950 text-white text-sm font-bold"
            >
              {copied ? "Copied!" : "Copy invite link"}
            </button>
            <button
              onClick={handleLeave}
              className="p-2 rounded-lg bg-gray-300 text-gray-950 text-sm font-bold"
            >
              Leave
            </button>
          </div>
        </div>
        <div className="p-4 border-b border-gray-300">
          <label htmlFor="language" className="text-sm text-gray-600">
            Language (shared with the room)
          </label>
          <select
            id="language"
            value={language}
            onChange={handleLanguageChange}
            className="mt-2 w-full p-2 rounded-lg bg-white text-gray-950 border border-gray-300"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.id} value={lang.id}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
        <h2 className="text-2xl font-bold p-4 border-b border-gray-300">
          Users
        </h2>
        <ul className="p-4 overflow-auto">
          {users.map((user, index) => (
            <li
              key={index}
              className="p-2 bg-gray-800 text-white rounded mb-2"
            >
              {user.username}
            </li>
          ))}
        </ul>
      </aside>
      <section className="w-3/4 bg-neutral-800 rounded-lg overflow-hidden">
        <Editor
          height="100%"
          language={language}
          defaultValue="// some comment"
          theme="vs-dark"
          onMount={(mountedEditor) => setEditor(mountedEditor)}
        />
      </section>
    </main>
  );
}

export default App;
