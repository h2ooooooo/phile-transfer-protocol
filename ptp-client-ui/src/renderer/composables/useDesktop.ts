import {computed, onMounted, onUnmounted, reactive, ref} from 'vue';
import type {Action, Connection, ConnectionDraft, DesktopAPI, Snapshot} from '../../shared/types';
import {previewAPI} from '../preview';

export function useDesktop() {
    const state = ref<Snapshot>({profiles: [], bridges: [], logs: [], secureStorage: false, release: null});
    const selectedId = ref('');
    const view = ref<'connections' | 'downloads'>('connections');
    const editing = ref(false);
    const busy = ref('');
    const error = ref('');
    const notice = ref('');
    const isPreview = import.meta.env.MODE === 'preview';
    let api: DesktopAPI | undefined = window.ptp;

    if (isPreview && !api) {
        api = previewAPI();
    }

    const draft = reactive<ConnectionDraft>(emptyDraft());
    const selected = computed(() => state.value.profiles.find(profile => profile.id === selectedId.value));
    const status = computed(() => state.value.bridges.find(bridge => bridge.profileId === selectedId.value));
    const runningCount = computed(() => state.value.bridges.filter(bridge => bridge.phase === 'running').length);
    const selectedLogs = computed(() => state.value.logs.filter(entry => entry.profileId === selectedId.value));

    function emptyDraft(): ConnectionDraft {
        const occupied = new Set(state.value.profiles.map(profile => profile.port));
        let port = 8021;

        while (occupied.has(port) && port < 65535) {
            port++;
        }

        return {id: '', name: '', kind: 'wordpress', apiEndPoint: '', apiUsername: '', password: '', host: '127.0.0.1', port, passiveUrl: '127.0.0.1', requestTransport: 'encrypted'};
    }

    function applySnapshot(snapshot: Snapshot): void {
        state.value = snapshot;

        if (!snapshot.profiles.some(profile => profile.id === selectedId.value)) {
            selectedId.value = snapshot.profiles[0]?.id || '';
        }
    }

    async function request<T>(action: Action, payload?: unknown): Promise<T | undefined> {
        error.value = '';
        notice.value = '';

        if (!api) {
            error.value = 'The desktop connection is unavailable. Open PTP with npm run dev or npm start.';

            return;
        }

        busy.value = action;

        try {
            const result = await api.invoke<T>(action, payload);

            if (result.error) {
                error.value = result.error;

                return;
            }

            return result.value;
        } catch (failure) {
            error.value = (failure as Error).message;
        } finally {
            busy.value = '';
        }
    }

    function select(id: string): void {
        selectedId.value = id;
        view.value = 'connections';
        editing.value = false;
        error.value = '';
        notice.value = '';
    }

    function edit(profile?: Connection): void {
        Object.assign(draft, emptyDraft(), profile, {password: ''});
        editing.value = true;
        view.value = 'connections';
        error.value = '';
        notice.value = '';
    }

    async function save(): Promise<void> {
        const profile = await request<Connection>('save', {...draft});

        if (profile) {
            const snapshot = await api!.invoke<Snapshot>('snapshot');

            if (snapshot.value) {
                applySnapshot(snapshot.value);
            }

            selectedId.value = profile.id;
            draft.password = '';
            editing.value = false;
            notice.value = 'Connection saved. Start the bridge when you are ready.';
        }
    }

    async function importYaml(): Promise<void> {
        const imported = await request<ConnectionDraft | null>('import');

        if (imported) {
            Object.assign(draft, emptyDraft(), imported);
            editing.value = true;
            view.value = 'connections';
            notice.value = 'YAML imported. Review the settings and replace any password placeholder before saving.';
        }
    }

    let unsubscribe: (() => void) | undefined;

    onMounted(async () => {
        unsubscribe = api?.subscribe(applySnapshot);
        const snapshot = await request<Snapshot>('snapshot');

        if (snapshot) {
            applySnapshot(snapshot);
        }
    });
    onUnmounted(() => unsubscribe?.());

    return {state, selectedId, view, editing, busy, error, notice, isPreview, draft, selected, status, runningCount, selectedLogs, request, select, edit, save, importYaml};
}
