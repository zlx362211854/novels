import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { multiChapterReviewApi } from '../services/api';
import { useFeedback } from '../components/ui/FeedbackProvider';
import { PageShell, SectionCard } from '../components/ui/PageShell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, CheckSquare, Loader2, PartyPopper } from 'lucide-react';
import ChapterDiffView from '../components/ChapterDiffView';

const TYPE_LABELS = {
  timeline: '时间线矛盾',
  character_state: '人物状态冲突',
  world_rule: '世界规则违反',
  knowledge: '知识时序问题',
  item_state: '物品状态矛盾',
};

const SEVERITY_VARIANT = {
  high: 'destructive',
  medium: 'secondary',
  low: 'outline',
};

const SEVERITY_LABEL = {
  high: '高',
  medium: '中',
  low: '低',
};

function IssueSeverityBadge({ severity }) {
  return (
    <Badge variant={SEVERITY_VARIANT[severity] || 'outline'}>
      {SEVERITY_LABEL[severity] || severity}
    </Badge>
  );
}

function IssueCard({ issue, selected, onToggle, userSuggestion, onSuggestionChange }) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 transition-colors cursor-pointer ${
        selected
          ? 'border-primary/60 bg-primary/5'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
      onClick={() => onToggle(issue.id)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-0.5" />
          <IssueSeverityBadge severity={issue.severity} />
          <span className="font-semibold text-slate-900 text-sm">
            {TYPE_LABELS[issue.type] || issue.type}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-muted-foreground">选择修复</span>
          <div
            className={`h-4 w-4 rounded border-2 flex items-center justify-center transition-colors ${
              selected
                ? 'border-primary bg-primary'
                : 'border-slate-300 bg-white'
            }`}
          >
            {selected && (
              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-sm text-slate-600">
        {issue.evidence?.length > 0 && (
          <p>
            <span className="font-medium text-slate-700">涉及章节：</span>
            {issue.evidence.map((e) => `第${e.chapterNumber}章`).join('、')}
          </p>
        )}
        {issue.description && (
          <p>
            <span className="font-medium text-slate-700">问题描述：</span>
            {issue.description}
          </p>
        )}
        {issue.evidence?.map((ev, idx) => (
          ev.excerpt && (
            <p key={idx}>
              <span className="font-medium text-slate-700">第{ev.chapterNumber}章证据：</span>
              <span className="italic">"{ev.excerpt}"</span>
            </p>
          )
        ))}
        {issue.suggestion && (
          <p>
            <span className="font-medium text-slate-700">建议：</span>
            {issue.suggestion}
          </p>
        )}
        <div className="pt-2" onClick={(event) => event.stopPropagation()}>
          <label className="mb-1 block text-xs font-medium text-slate-700">
            我的修订建议
          </label>
          <Textarea
            value={userSuggestion || ''}
            onChange={(event) => onSuggestionChange(issue.id, event.target.value)}
            placeholder="例如：保留第12章伏笔，不要改人物关系；只微调结尾；不要新增设定。"
            className="min-h-24 bg-white"
          />
        </div>
      </div>
    </div>
  );
}

function LoadingState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function AllDoneState({ novelId }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <PartyPopper className="h-10 w-10 text-primary" />
      <div>
        <p className="text-lg font-semibold text-slate-900">全部修订已完成！</p>
        <p className="mt-1 text-sm text-muted-foreground">所有章节已处理完毕，可以返回继续创作。</p>
      </div>
      <Button asChild>
        <Link to={`/novels/${novelId}/chapters`}>返回章节列表</Link>
      </Button>
    </div>
  );
}

export default function MultiChapterReview() {
  const { novelId, reviewId } = useParams();
  const navigate = useNavigate();
  const feedback = useFeedback();

  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIssueIds, setSelectedIssueIds] = useState(new Set());
  const [issueSuggestions, setIssueSuggestions] = useState({});
  const [fixing, setFixing] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [currentDraftIndex, setCurrentDraftIndex] = useState(0);
  const [applying, setApplying] = useState(false);
  const [allDone, setAllDone] = useState(false);

  useEffect(() => {
    loadReview();
  }, [reviewId]);

  const loadReview = async () => {
    setLoading(true);
    try {
      const res = await multiChapterReviewApi.getReview(reviewId);
      setReview(res.data);
      if (res.data.status === 'fixed') {
        const draftsRes = await multiChapterReviewApi.getDrafts(reviewId);
        setDrafts(draftsRes.data);
      }
    } catch (error) {
      feedback.error(error.response?.data?.error || '加载审阅结果失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleIssue = (id) => {
    setSelectedIssueIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleStartFix = async () => {
    setFixing(true);
    try {
      const selectedSuggestions = Object.fromEntries(
        Array.from(selectedIssueIds)
          .map((issueId) => [issueId, issueSuggestions[issueId]?.trim() || ''])
          .filter(([, suggestion]) => suggestion)
      );
      await multiChapterReviewApi.startFix(
        reviewId,
        Array.from(selectedIssueIds),
        selectedSuggestions
      );
      const draftsRes = await multiChapterReviewApi.getDrafts(reviewId);
      setDrafts(draftsRes.data);
      setCurrentDraftIndex(0);
    } catch (error) {
      feedback.error(error.response?.data?.error || '生成修订稿失败');
    } finally {
      setFixing(false);
    }
  };

  const handleSuggestionChange = (issueId, value) => {
    setIssueSuggestions((prev) => ({
      ...prev,
      [issueId]: value,
    }));
  };

  const handleApply = async (accept) => {
    if (applying) return;
    const draft = drafts[currentDraftIndex];
    setApplying(true);
    try {
      await multiChapterReviewApi.apply(reviewId, draft.chapterId, accept);
      if (currentDraftIndex + 1 >= drafts.length) {
        setAllDone(true);
      } else {
        setCurrentDraftIndex((prev) => prev + 1);
      }
    } catch (error) {
      feedback.error(error.response?.data?.error || '应用修订失败');
    } finally {
      setApplying(false);
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <LoadingState message="正在加载审阅结果..." />
      </div>
    );
  }

  const issues = review?.issues || [];
  const issueCount = issues.length;

  // Phase 3: All done
  if (allDone) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <AllDoneState novelId={novelId} />
      </div>
    );
  }

  // Phase 2: Generating fix
  if (fixing) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <LoadingState message="正在生成修订稿，请稍候..." />
      </div>
    );
  }

  // Phase 3: Diff view
  if (drafts.length > 0) {
    const draft = drafts[currentDraftIndex];
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/novels/${novelId}/chapters`} className="flex items-center">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回章节列表
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">
            正在审阅修订稿 {currentDraftIndex + 1} / {drafts.length}
          </span>
        </div>
        <ChapterDiffView
          originalContent={draft.originalContent}
          revisedContent={draft.revisedContent}
          summary={draft.summary}
          chapterNumber={draft.chapterNumber}
          title={draft.title}
          onAccept={() => handleApply(true)}
          onSkip={() => handleApply(false)}
          isLast={currentDraftIndex + 1 >= drafts.length}
          currentIndex={currentDraftIndex}
          totalCount={drafts.length}
        />
      </div>
    );
  }

  // Phase 1: Issue list
  return (
    <PageShell
      eyebrow="Multi-Chapter Review"
      title="跨章审阅结果"
      description={`发现 ${issueCount} 个跨章逻辑问题`}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/novels/${novelId}/chapters`} className="flex items-center">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              返回
            </Link>
          </Button>
          {selectedIssueIds.size > 0 && (
            <span className="text-sm text-muted-foreground">
              已选 {selectedIssueIds.size} 个问题
            </span>
          )}
          <Button
            size="sm"
            disabled={selectedIssueIds.size === 0}
            onClick={handleStartFix}
          >
            <CheckSquare className="mr-1.5 h-4 w-4" />
            生成修订稿
          </Button>
        </div>
      }
    >
      {issues.length === 0 ? (
        <SectionCard title="审阅完成">
          <div className="rounded-[28px] border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-slate-800">未发现跨章逻辑问题</p>
            <p className="mt-2 text-sm text-slate-500">所选章节之间的逻辑连贯性良好。</p>
          </div>
        </SectionCard>
      ) : (
        <SectionCard
          title="发现的问题"
          description="点击问题卡片可选择是否加入修复范围，选好后点击「生成修订稿」。"
        >
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueCard
                key={issue.id}
                issue={issue}
                selected={selectedIssueIds.has(issue.id)}
                onToggle={toggleIssue}
                userSuggestion={issueSuggestions[issue.id] || ''}
                onSuggestionChange={handleSuggestionChange}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </PageShell>
  );
}
