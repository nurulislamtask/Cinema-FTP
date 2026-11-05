package com.cineftp.mobile;

import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.GestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import org.json.JSONArray;
import org.json.JSONObject;
import org.videolan.libvlc.LibVLC;
import org.videolan.libvlc.Media;
import org.videolan.libvlc.MediaPlayer;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * CineFTP's one and only phone player (libVLC engine): plays practically every file, hardware decoding
 * with automatic software fallback, gestures, audio / subtitle track picker, online subtitle search
 * (and automatic subtitles), speed, aspect ratio, next / previous.
 */
public class VlcPlayerActivity extends AppCompatActivity {

    private LibVLC libVlc;
    private MediaPlayer mp;
    private SurfaceView surface;
    private LinearLayout topBar, bottomBar;
    private TextView titleView, timeView, playBtn, hud, audioBtn, hwBtn, speedBtn, aspectBtn;
    private SeekBar seek;
    private AudioManager audio;
    private final Handler ui = new Handler(Looper.getMainLooper());

    // queue
    private final ArrayList<String> urls = new ArrayList<>();
    private final ArrayList<String> titles = new ArrayList<>();
    private final ArrayList<String> queries = new ArrayList<>();
    private final ArrayList<Integer> years = new ArrayList<>();
    private final ArrayList<Integer> seasons = new ArrayList<>();
    private final ArrayList<Integer> episodes = new ArrayList<>();
    private final ArrayList<List<String>> extSubs = new ArrayList<>();
    private int index = 0;
    private long pendingStart = 0L;

    // state
    private boolean finishedOnce = false;
    private boolean userSeeking = false;
    private boolean hardware = true;
    private boolean surfaceReady = false;
    private boolean started = false;
    private boolean playingSeen = false;
    private boolean triedSoftware = false;
    private boolean autoSubs = true;
    private boolean autoSubsDone = false;
    private String subLang = "eng";
    private String errorText = null;
    private long lastDuration = 0L;
    private long lastTime = 0L;
    private int aspectMode = 0;
    private final String[] ASPECT = {"Fit", "16:9", "4:3", "Fill"};
    private int speedIdx = 1;
    private final float[] SPEEDS = {0.75f, 1f, 1.25f, 1.5f, 2f};

    // gestures
    private int gesture = 0; // 0 none, 1 brightness, 2 volume, 3 seek
    private float brightnessNow = 0.5f;
    private int volumeStart = 0;
    private long seekBase = 0, seekTarget = 0;
    private boolean longPress = false;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            if (mp != null) {
                long len = mp.getLength();
                long t = mp.getTime();
                if (len > 0) lastDuration = len;
                if (t >= 0) lastTime = t;
                if (!userSeeking && lastDuration > 0) {
                    seek.setMax((int) (lastDuration / 1000));
                    seek.setProgress((int) (lastTime / 1000));
                }
                timeView.setText(fmt(lastTime) + " / " + fmt(lastDuration));
                playBtn.setText(mp.isPlaying() ? "❚❚" : "▶");
            }
            ui.postDelayed(this, 500);
        }
    };
    private final Runnable hideBars = () -> setBars(false);
    private final Runnable hudOff = () -> hud.setVisibility(View.GONE);

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(w, false);
        hideSystemBars();
        audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);

        try {
            Intent in = getIntent();
            JSONArray items = new JSONArray(in.getStringExtra("items"));
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.getJSONObject(i);
                urls.add(o.getString("url"));
                titles.add(o.optString("title", ""));
                queries.add(o.optString("query", o.optString("title", "")));
                years.add(o.optInt("year", 0));
                seasons.add(o.optInt("season", 0));
                episodes.add(o.optInt("episode", 0));
                List<String> subs = new ArrayList<>();
                JSONArray sa = o.optJSONArray("subtitles");
                if (sa != null) for (int s = 0; s < sa.length() && s < 12; s++) subs.add(sa.getJSONObject(s).getString("url"));
                extSubs.add(subs);
            }
            index = Math.max(0, Math.min(in.getIntExtra("index", 0), urls.size() - 1));
            pendingStart = Math.max(0L, in.getLongExtra("position", 0L));
            hardware = !in.getBooleanExtra("software", false);
            autoSubs = in.getBooleanExtra("autoSubs", true);
            String sl = in.getStringExtra("subLang");
            if (sl != null && !sl.isEmpty()) subLang = sl;
        } catch (Exception e) {
            finish();
            return;
        }

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        surface = new SurfaceView(this);
        root.addView(surface, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // ---- top bar
        topBar = new LinearLayout(this);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xCC000000, 0}));
        topBar.setPadding(dp(14), dp(10), dp(14), dp(22));
        TextView close = btn("✕");
        close.setOnClickListener(v -> finish());
        topBar.addView(close);
        titleView = new TextView(this);
        titleView.setTextColor(Color.WHITE);
        titleView.setTextSize(15f);
        titleView.setSingleLine(true);
        titleView.setEllipsize(android.text.TextUtils.TruncateAt.END);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = dp(10);
        tlp.rightMargin = dp(10);
        topBar.addView(titleView, tlp);
        audioBtn = btn("Audio");
        audioBtn.setOnClickListener(v -> pickTrack(true));
        topBar.addView(audioBtn, margin());
        TextView subBtn = btn("Subs");
        subBtn.setOnClickListener(v -> subtitleMenu());
        topBar.addView(subBtn, margin());
        TextView ext = btn("Open with");
        ext.setOnClickListener(v -> openWithOtherPlayer());
        topBar.addView(ext, margin());
        hwBtn = btn(hardware ? "HW" : "SW");
        hwBtn.setOnClickListener(v -> { hardware = !hardware; hwBtn.setText(hardware ? "HW" : "SW"); reloadHere(); });
        topBar.addView(hwBtn, margin());
        aspectBtn = btn("Fit");
        aspectBtn.setOnClickListener(v -> {
            aspectMode = (aspectMode + 1) % ASPECT.length;
            aspectBtn.setText(ASPECT[aspectMode]);
            applyAspect();
        });
        topBar.addView(aspectBtn);
        root.addView(topBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // ---- bottom bar
        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xCC000000, 0}));
        bottomBar.setPadding(dp(16), dp(24), dp(16), dp(12));
        seek = new SeekBar(this);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser) timeView.setText(fmt(p * 1000L) + " / " + fmt(lastDuration));
            }
            @Override public void onStartTrackingTouch(SeekBar s) { userSeeking = true; ui.removeCallbacks(hideBars); }
            @Override public void onStopTrackingTouch(SeekBar s) {
                userSeeking = false;
                if (mp != null) mp.setTime(s.getProgress() * 1000L);
                ui.postDelayed(hideBars, 4000);
            }
        });
        bottomBar.addView(seek);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView prev = btn("⏮");
        prev.setOnClickListener(v -> go(index - 1));
        row.addView(prev, margin());
        TextView back = btn("↺ 10");
        back.setOnClickListener(v -> skip(-10000));
        row.addView(back, margin());
        playBtn = btn("❚❚");
        playBtn.setOnClickListener(v -> toggle());
        row.addView(playBtn, margin());
        TextView fwd = btn("10 ↻");
        fwd.setOnClickListener(v -> skip(10000));
        row.addView(fwd, margin());
        TextView next = btn("⏭");
        next.setOnClickListener(v -> go(index + 1));
        row.addView(next, margin());
        speedBtn = btn("1x");
        speedBtn.setOnClickListener(v -> {
            speedIdx = (speedIdx + 1) % SPEEDS.length;
            if (mp != null) mp.setRate(SPEEDS[speedIdx]);
            speedBtn.setText(SPEEDS[speedIdx] + "x");
        });
        row.addView(speedBtn, margin());
        timeView = new TextView(this);
        timeView.setTextColor(Color.WHITE);
        timeView.setGravity(Gravity.END);
        row.addView(timeView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bottomBar.addView(row);
        root.addView(bottomBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        hud = new TextView(this);
        hud.setTextColor(Color.WHITE);
        hud.setTextSize(18f);
        hud.setGravity(Gravity.CENTER);
        hud.setPadding(dp(20), dp(12), dp(20), dp(12));
        GradientDrawable hb = new GradientDrawable();
        hb.setColor(0xB0000000);
        hb.setCornerRadius(dp(14));
        hud.setBackground(hb);
        hud.setVisibility(View.GONE);
        root.addView(hud, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        setupGestures();

        try {
            ArrayList<String> opts = new ArrayList<>();
            opts.add("--no-drop-late-frames");
            opts.add("--no-skip-frames");
            opts.add("--network-caching=3000");
            opts.add("--audio-time-stretch");
            libVlc = new LibVLC(this, opts);
            mp = new MediaPlayer(libVlc);
        } catch (Throwable t) {
            errorText = "Player engine failed: " + t.getMessage();
            Toast.makeText(this, errorText, Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        surface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder h) {
                if (mp == null) return;
                mp.getVLCVout().setVideoView(surface);
                mp.getVLCVout().attachViews();
                mp.getVLCVout().setWindowSize(surface.getWidth(), surface.getHeight());
                surfaceReady = true;
                if (!started) { started = true; load(index, pendingStart); }
            }
            @Override public void surfaceChanged(SurfaceHolder h, int f, int w2, int h2) {
                if (mp != null) mp.getVLCVout().setWindowSize(w2, h2);
                applyAspect();
            }
            @Override public void surfaceDestroyed(SurfaceHolder h) {
                if (mp != null) mp.getVLCVout().detachViews();
            }
        });

        mp.setEventListener(event -> {
            switch (event.type) {
                case MediaPlayer.Event.Playing:
                    if (!playingSeen) { playingSeen = true; onFirstPlaying(); }
                    break;
                case MediaPlayer.Event.ESAdded:
                    updateAudioLabel();
                    break;
                case MediaPlayer.Event.EndReached:
                    if (index + 1 < urls.size()) go(index + 1); else finish();
                    break;
                case MediaPlayer.Event.EncounteredError:
                    onEngineError();
                    break;
                default:
                    break;
            }
        });

        ui.post(tick);
        ui.postDelayed(hideBars, 3500);
    }

    // ------------------------------------------------------------ playback

    private void load(int i, long startMs) {
        if (mp == null || i < 0 || i >= urls.size()) return;
        index = i;
        playingSeen = false;
        triedSoftware = !hardware;
        autoSubsDone = false;
        errorText = null;
        titleView.setText(titles.get(i));
        startMedia(startMs);
        // slow / silent failures: if nothing plays in 25 s, retry with software decoding
        final int mine = ++loadToken;
        ui.postDelayed(() -> {
            if (mine == loadToken && !playingSeen && !triedSoftware) {
                triedSoftware = true;
                hardware = false;
                hwBtn.setText("SW");
                showHud("Trying software decoder…");
                startMedia(lastTime > 0 ? lastTime : startMs);
            }
        }, 25000);
    }
    private int loadToken = 0;

    private void startMedia(long startMs) {
        try {
            Media m = new Media(libVlc, Uri.parse(urls.get(index)));
            m.setHWDecoderEnabled(hardware, false);
            m.addOption(":network-caching=3000");
            if (startMs > 1000) m.addOption(":start-time=" + (startMs / 1000.0));
            mp.setMedia(m);
            m.release();
            mp.play();
            mp.setRate(SPEEDS[speedIdx]);
        } catch (Throwable t) {
            errorText = String.valueOf(t.getMessage());
            showHud("Cannot play: " + t.getMessage());
        }
    }

    private void reloadHere() {
        playingSeen = false;
        showHud(hardware ? "Hardware decoder" : "Software decoder");
        startMedia(Math.max(0L, lastTime));
    }

    private void onEngineError() {
        if (hardware && !triedSoftware) {
            triedSoftware = true;
            hardware = false;
            hwBtn.setText("SW");
            showHud("Trying software decoder…");
            ui.post(() -> startMedia(Math.max(0L, lastTime)));
            return;
        }
        errorText = "This file could not be played";
        setBars(true);
        showHud("Cannot play this file.\nTry “Open with” to use another app.");
    }

    private void onFirstPlaying() {
        updateAudioLabel();
        // subtitle files that sit next to the video on the server
        for (String u : extSubs.get(index)) {
            try { mp.addSlave(Media.Slave.Type.Subtitle, Uri.parse(u), false); } catch (Throwable ignored) { }
        }
        if (autoSubs && !queries.get(index).isEmpty()) {
            final int mine = loadToken;
            ui.postDelayed(() -> { if (mine == loadToken) autoSubtitle(); }, 4000);
        }
    }

    private int realTracks(MediaPlayer.TrackDescription[] l) {
        int n = 0;
        if (l != null) for (MediaPlayer.TrackDescription t : l) if (t.id >= 0) n++;
        return n;
    }

    private void updateAudioLabel() {
        if (mp == null) return;
        int n = realTracks(mp.getAudioTracks());
        audioBtn.setText(n > 1 ? "Audio (" + n + ")" : "Audio");
        if (n > 1 && !audioHint) { audioHint = true; showHud(n + " audio tracks – tap Audio to choose"); }
    }
    private boolean audioHint = false;

    private void toggle() {
        if (mp == null) return;
        if (mp.isPlaying()) mp.pause(); else mp.play();
    }

    private void go(int i) {
        if (i < 0 || i >= urls.size()) return;
        lastTime = 0;
        audioHint = false;
        load(i, 0);
    }

    private void skip(long d) {
        if (mp == null) return;
        long t = Math.max(0L, mp.getTime() + d);
        if (lastDuration > 0) t = Math.min(t, lastDuration - 1000);
        mp.setTime(t);
        showHud((d > 0 ? "+" : "-") + Math.abs(d / 1000) + "s");
    }

    private void applyAspect() {
        if (mp == null) return;
        switch (aspectMode) {
            case 1: mp.setAspectRatio("16:9"); break;
            case 2: mp.setAspectRatio("4:3"); break;
            default: mp.setAspectRatio(null);
        }
        mp.setScale(0f);
        if (aspectMode == 3) { mp.setAspectRatio(surface.getWidth() + ":" + surface.getHeight()); }
    }

    // ------------------------------------------------------------ tracks / subtitles

    private void pickTrack(final boolean audioTracks) {
        if (mp == null) return;
        final MediaPlayer.TrackDescription[] list = audioTracks ? mp.getAudioTracks() : mp.getSpuTracks();
        if (list == null || list.length == 0 || (audioTracks && realTracks(list) == 0)) {
            Toast.makeText(this, audioTracks ? "No audio tracks" : "No subtitle tracks yet", Toast.LENGTH_SHORT).show();
            return;
        }
        final int current = audioTracks ? mp.getAudioTrack() : mp.getSpuTrack();
        String[] names = new String[list.length];
        for (int i = 0; i < list.length; i++) {
            String n = list[i].name == null ? ("Track " + i) : list[i].name;
            names[i] = n + (list[i].id == current ? "  ✓" : "");
        }
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle(audioTracks ? "Audio track" : "Subtitle track")
            .setItems(names, (d, which) -> {
                if (audioTracks) mp.setAudioTrack(list[which].id);
                else mp.setSpuTrack(list[which].id);
            })
            .show();
    }

    private void subtitleMenu() {
        final String[] opts = {"Choose subtitle track", "Search online (" + langName(subLang) + ")",
            "Search online – other language", "Subtitles off"};
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle("Subtitles")
            .setItems(opts, (d, which) -> {
                if (which == 0) pickTrack(false);
                else if (which == 1) searchSubs(subLang, false);
                else if (which == 2) {
                    final String[] names = {"English", "Bangla", "Hindi", "Arabic", "Spanish"};
                    final String[] codes = {"eng", "ben", "hin", "ara", "spa"};
                    new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                        .setTitle("Language")
                        .setItems(names, (d2, w2) -> searchSubs(codes[w2], false))
                        .show();
                } else if (mp != null) mp.setSpuTrack(-1);
            })
            .show();
    }

    private static String langName(String code) {
        switch (code) {
            case "ben": return "Bangla";
            case "hin": return "Hindi";
            case "ara": return "Arabic";
            case "spa": return "Spanish";
            default: return "English";
        }
    }

    private void autoSubtitle() {
        if (mp == null || autoSubsDone) return;
        autoSubsDone = true;
        // the file already carries subtitles (embedded or from the server): leave them alone
        if (realTracks(mp.getSpuTracks()) > 0) return;
        searchSubs(subLang, true);
    }

    private void searchSubs(final String lang, final boolean auto) {
        final int idx = index;
        final String q = queries.get(idx);
        if (q.isEmpty()) {
            if (!auto) Toast.makeText(this, "No title to search for", Toast.LENGTH_SHORT).show();
            return;
        }
        if (!auto) Toast.makeText(this, "Searching subtitles…", Toast.LENGTH_SHORT).show();
        new Thread(() -> {
            try {
                final List<SubtitleFinder.Result> res =
                    SubtitleFinder.search(q, years.get(idx), seasons.get(idx), episodes.get(idx), lang);
                runOnUiThread(() -> {
                    if (isFinishing() || idx != index) return;
                    if (res.isEmpty()) {
                        if (!auto) Toast.makeText(this, "No subtitles found for this title", Toast.LENGTH_LONG).show();
                        return;
                    }
                    if (auto) { downloadSub(res.get(0), true); return; }
                    String[] labels = new String[res.size()];
                    for (int i = 0; i < res.size(); i++) labels[i] = res.get(i).label;
                    new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
                        .setTitle(res.size() + " subtitles found")
                        .setItems(labels, (d, which) -> downloadSub(res.get(which), false))
                        .show();
                });
            } catch (final Exception e) {
                runOnUiThread(() -> { if (!auto) Toast.makeText(this, "Subtitle search failed: " + e.getMessage(), Toast.LENGTH_LONG).show(); });
            }
        }).start();
    }

    private void downloadSub(final SubtitleFinder.Result r, final boolean auto) {
        final int idx = index;
        new Thread(() -> {
            try {
                final File f = SubtitleFinder.download(this, r.link);
                runOnUiThread(() -> {
                    if (isFinishing() || mp == null || idx != index) return;
                    mp.addSlave(Media.Slave.Type.Subtitle, Uri.fromFile(f), true);
                    showHud((auto ? "Auto subtitle: " : "Subtitle: ") + r.label);
                });
            } catch (final Exception e) {
                runOnUiThread(() -> { if (!auto) Toast.makeText(this, "Download failed: " + e.getMessage(), Toast.LENGTH_LONG).show(); });
            }
        }).start();
    }

    private void openWithOtherPlayer() {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(Uri.parse(urls.get(index)), "video/*");
            if (mp != null) mp.pause();
            startActivity(Intent.createChooser(i, "Open with"));
        } catch (Exception e) {
            Toast.makeText(this, "No other player found", Toast.LENGTH_SHORT).show();
        }
    }

    // ------------------------------------------------------------ gestures

    private void setupGestures() {
        final GestureDetector gd = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onDown(MotionEvent e) { gesture = 0; return true; }
            @Override public boolean onSingleTapConfirmed(MotionEvent e) {
                setBars(topBar.getVisibility() != View.VISIBLE);
                return true;
            }
            @Override public boolean onDoubleTap(MotionEvent e) {
                float x = e.getX() / Math.max(1, surface.getWidth());
                if (x < 0.35f) skip(-10000);
                else if (x > 0.65f) skip(10000);
                else toggle();
                return true;
            }
            @Override public void onLongPress(MotionEvent e) {
                if (mp == null) return;
                longPress = true;
                mp.setRate(2f);
                showHud("2x");
            }
            @Override public boolean onScroll(MotionEvent e1, MotionEvent e2, float dx, float dy) {
                if (e1 == null || mp == null || longPress) return false;
                int w = Math.max(1, surface.getWidth()), h = Math.max(1, surface.getHeight());
                if (gesture == 0) {
                    if (Math.abs(e2.getX() - e1.getX()) > Math.abs(e2.getY() - e1.getY())) {
                        gesture = 3;
                        seekBase = Math.max(0L, mp.getTime());
                    } else if (e1.getX() < w / 2f) {
                        gesture = 1;
                        float cur = getWindow().getAttributes().screenBrightness;
                        brightnessNow = cur < 0 ? 0.5f : cur;
                    } else {
                        gesture = 2;
                        volumeStart = audio.getStreamVolume(AudioManager.STREAM_MUSIC);
                    }
                }
                float dyTotal = e1.getY() - e2.getY();
                if (gesture == 1) {
                    float v = Math.max(0.02f, Math.min(1f, brightnessNow + dyTotal / h));
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = v;
                    getWindow().setAttributes(lp);
                    showHud("☀ " + Math.round(v * 100) + "%");
                } else if (gesture == 2) {
                    int max = audio.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
                    int v = Math.max(0, Math.min(max, volumeStart + Math.round(dyTotal / h * max * 1.2f)));
                    audio.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
                    showHud("🔊 " + Math.round(v * 100f / max) + "%");
                } else if (gesture == 3) {
                    long delta = Math.round((e2.getX() - e1.getX()) / w * 120000f);
                    seekTarget = Math.max(0L, seekBase + delta);
                    if (lastDuration > 0) seekTarget = Math.min(seekTarget, lastDuration - 1000);
                    showHud(fmt(seekTarget) + "  (" + (delta >= 0 ? "+" : "-") + Math.abs(delta / 1000) + "s)");
                }
                return true;
            }
        });
        surface.setOnTouchListener((v, e) -> {
            gd.onTouchEvent(e);
            if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                if (gesture == 3 && mp != null) mp.setTime(seekTarget);
                if (longPress && mp != null) { mp.setRate(SPEEDS[speedIdx]); hud.setVisibility(View.GONE); }
                longPress = false;
                gesture = 0;
            }
            return true;
        });
    }

    // ------------------------------------------------------------ ui helpers

    private void setBars(boolean show) {
        ui.removeCallbacks(hideBars);
        topBar.setVisibility(show ? View.VISIBLE : View.GONE);
        bottomBar.setVisibility(show ? View.VISIBLE : View.GONE);
        if (show) ui.postDelayed(hideBars, 4000);
    }

    private void showHud(String s) {
        hud.setText(s);
        hud.setVisibility(View.VISIBLE);
        ui.removeCallbacks(hudOff);
        ui.postDelayed(hudOff, 2200);
    }

    private TextView btn(String text) {
        TextView b = new TextView(this);
        b.setText(text);
        b.setTextColor(Color.WHITE);
        b.setTextSize(15f);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(12), dp(6), dp(12), dp(6));
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(0x66000000);
        bg.setCornerRadius(dp(18));
        b.setBackground(bg);
        return b;
    }

    private LinearLayout.LayoutParams margin() {
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.rightMargin = dp(8);
        return p;
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }

    private static String fmt(long ms) {
        long s = Math.max(0, ms / 1000);
        long h = s / 3600, m = (s % 3600) / 60, sec = s % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, sec) : String.format(Locale.US, "%02d:%02d", m, sec);
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat c = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    // ------------------------------------------------------------ lifecycle

    @Override
    public void finish() {
        if (!finishedOnce) {
            finishedOnce = true;
            Intent r = new Intent();
            r.putExtra("index", index);
            r.putExtra("position", lastTime);
            r.putExtra("duration", lastDuration);
            if (errorText != null && lastTime < 5000) r.putExtra("error", errorText);
            setResult(RESULT_OK, r);
        }
        super.finish();
    }

    @Override protected void onStop() {
        super.onStop();
        if (mp != null && mp.isPlaying()) mp.pause();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        try {
            if (mp != null) { mp.stop(); mp.getVLCVout().detachViews(); mp.release(); }
            if (libVlc != null) libVlc.release();
        } catch (Throwable ignored) { }
        mp = null;
        libVlc = null;
        super.onDestroy();
    }
}
