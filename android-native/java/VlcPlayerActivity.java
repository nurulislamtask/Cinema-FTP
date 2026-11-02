package com.cineftp.mobile;

import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
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

import java.util.ArrayList;
import java.util.Locale;

/**
 * Fallback player built on libVLC. It decodes practically everything (HEVC 10-bit, odd containers,
 * DTS / TrueHD audio ...) in software, so it is used when ExoPlayer cannot play a file.
 */
public class VlcPlayerActivity extends AppCompatActivity {

    private LibVLC libVlc;
    private MediaPlayer mp;
    private SurfaceView surface;
    private LinearLayout topBar, bottomBar;
    private TextView titleView, timeView, playBtn, hud;
    private SeekBar seek;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ArrayList<String> urls = new ArrayList<>();
    private final ArrayList<String> titles = new ArrayList<>();
    private int index = 0;
    private boolean finishedOnce = false;
    private boolean userSeeking = false;
    private long lastDuration = 0L;
    private long lastTime = 0L;
    private long pendingStart = 0L;
    private int aspectMode = 0;
    private final String[] ASPECT = {"Fit", "16:9", "4:3", "Fill"};

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

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowCompat.setDecorFitsSystemWindows(w, false);
        hideSystemBars();

        try {
            JSONArray items = new JSONArray(getIntent().getStringExtra("items"));
            for (int i = 0; i < items.length(); i++) {
                JSONObject o = items.getJSONObject(i);
                urls.add(o.getString("url"));
                titles.add(o.optString("title", ""));
            }
            index = Math.max(0, Math.min(getIntent().getIntExtra("index", 0), urls.size() - 1));
            pendingStart = Math.max(0L, getIntent().getLongExtra("position", 0L));
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

        // top bar
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
        TextView audioBtn = btn("Audio");
        audioBtn.setOnClickListener(v -> pickTrack(true));
        topBar.addView(audioBtn, margin());
        TextView subBtn = btn("Subs");
        subBtn.setOnClickListener(v -> pickTrack(false));
        topBar.addView(subBtn, margin());
        TextView aspectBtn = btn("Fit");
        aspectBtn.setOnClickListener(v -> {
            aspectMode = (aspectMode + 1) % ASPECT.length;
            aspectBtn.setText(ASPECT[aspectMode]);
            applyAspect();
        });
        topBar.addView(aspectBtn);
        root.addView(topBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));

        // bottom bar
        bottomBar = new LinearLayout(this);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xCC000000, 0}));
        bottomBar.setPadding(dp(16), dp(24), dp(16), dp(12));
        seek = new SeekBar(this);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean fromUser) {
                if (fromUser) timeView.setText(fmt(p * 1000L) + " / " + fmt(lastDuration));
            }
            @Override public void onStartTrackingTouch(SeekBar s) { userSeeking = true; }
            @Override public void onStopTrackingTouch(SeekBar s) {
                userSeeking = false;
                if (mp != null) mp.setTime(s.getProgress() * 1000L);
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
        playBtn.setOnClickListener(v -> { if (mp != null) { if (mp.isPlaying()) mp.pause(); else mp.play(); } });
        row.addView(playBtn, margin());
        TextView fwd = btn("10 ↻");
        fwd.setOnClickListener(v -> skip(10000));
        row.addView(fwd, margin());
        TextView next = btn("⏭");
        next.setOnClickListener(v -> go(index + 1));
        row.addView(next, margin());
        timeView = new TextView(this);
        timeView.setTextColor(Color.WHITE);
        timeView.setGravity(Gravity.END);
        row.addView(timeView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bottomBar.addView(row);
        root.addView(bottomBar, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM));

        hud = new TextView(this);
        hud.setTextColor(Color.WHITE);
        hud.setTextSize(16f);
        hud.setGravity(Gravity.CENTER);
        hud.setPadding(dp(18), dp(10), dp(18), dp(10));
        GradientDrawable hb = new GradientDrawable();
        hb.setColor(0xB0000000);
        hb.setCornerRadius(dp(14));
        hud.setBackground(hb);
        hud.setVisibility(View.GONE);
        root.addView(hud, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER));

        // taps: single = show / hide controls, double tap sides = +-10s, middle = play / pause
        final GestureDetector gd = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override public boolean onSingleTapConfirmed(MotionEvent e) { setBars(topBar.getVisibility() != View.VISIBLE); return true; }
            @Override public boolean onDoubleTap(MotionEvent e) {
                float x = e.getX() / Math.max(1, surface.getWidth());
                if (x < 0.35f) skip(-10000);
                else if (x > 0.65f) skip(10000);
                else if (mp != null) { if (mp.isPlaying()) mp.pause(); else mp.play(); }
                return true;
            }
        });
        surface.setOnTouchListener((v, e) -> { gd.onTouchEvent(e); return true; });

        try {
            ArrayList<String> opts = new ArrayList<>();
            opts.add("--no-drop-late-frames");
            opts.add("--no-skip-frames");
            opts.add("--network-caching=3000");
            opts.add("--avcodec-hw=any");
            libVlc = new LibVLC(this, opts);
            mp = new MediaPlayer(libVlc);
        } catch (Throwable t) {
            Toast.makeText(this, "Player engine failed: " + t.getMessage(), Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        surface.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override public void surfaceCreated(SurfaceHolder h) {
                mp.getVLCVout().setVideoView(surface);
                mp.getVLCVout().attachViews();
                mp.getVLCVout().setWindowSize(surface.getWidth(), surface.getHeight());
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
            if (event.type == MediaPlayer.Event.EndReached) {
                if (index + 1 < urls.size()) go(index + 1);
                else finish();
            } else if (event.type == MediaPlayer.Event.EncounteredError) {
                showHud("Cannot play this file (VLC engine)");
                errorText = "VLC engine could not play this file";
            } else if (event.type == MediaPlayer.Event.Playing) {
                if (!hintShown) {
                    hintShown = true;
                    int n = mp.getAudioTracks() == null ? 0 : mp.getAudioTracks().length;
                    if (n > 2) showHud(n - 1 + " audio tracks – tap Audio to choose");
                }
            }
        });

        ui.post(tick);
        ui.postDelayed(hideBars, 3500);
    }

    private boolean started = false;
    private boolean hintShown = false;
    private String errorText = null;

    private void load(int i, long startMs) {
        if (mp == null || i < 0 || i >= urls.size()) return;
        index = i;
        hintShown = false;
        titleView.setText(titles.get(i));
        try {
            Media m = new Media(libVlc, Uri.parse(urls.get(i)));
            m.addOption(":network-caching=3000");
            if (startMs > 1000) m.addOption(":start-time=" + (startMs / 1000.0));
            mp.setMedia(m);
            m.release();
            mp.play();
        } catch (Throwable t) {
            errorText = String.valueOf(t.getMessage());
            showHud("Cannot play: " + t.getMessage());
        }
    }

    private void go(int i) {
        if (i < 0 || i >= urls.size()) return;
        lastTime = 0;
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
            case 1: mp.setAspectRatio("16:9"); mp.setScale(0f); break;
            case 2: mp.setAspectRatio("4:3"); mp.setScale(0f); break;
            case 3: mp.setAspectRatio(null); mp.setScale(0f); break;
            default: mp.setAspectRatio(null); mp.setScale(0f);
        }
    }

    private void pickTrack(final boolean audioTracks) {
        if (mp == null) return;
        final MediaPlayer.TrackDescription[] list = audioTracks ? mp.getAudioTracks() : mp.getSpuTracks();
        if (list == null || list.length == 0) {
            Toast.makeText(this, audioTracks ? "No audio tracks" : "No subtitle tracks", Toast.LENGTH_SHORT).show();
            return;
        }
        String[] names = new String[list.length];
        for (int i = 0; i < list.length; i++) names[i] = list[i].name == null ? ("Track " + i) : list[i].name;
        new AlertDialog.Builder(this, androidx.appcompat.R.style.Theme_AppCompat_Dialog_Alert)
            .setTitle(audioTracks ? "Audio track" : "Subtitles")
            .setItems(names, (d, which) -> {
                if (audioTracks) mp.setAudioTrack(list[which].id);
                else mp.setSpuTrack(list[which].id);
            })
            .show();
    }

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
    private final Runnable hudOff = () -> hud.setVisibility(View.GONE);

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
