/* ExportWizard — owns the wizard state; the four steps are presentational. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ExportWizardSteps } from "@devdigest/ui";
import type { Agent, CiFile } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useExportCi, useRepos } from "@/lib/hooks";
import { CI_TRIGGERS, WIZARD_STEPS, type CiPostAs } from "../../constants";
import { exportErrorKey } from "../../helpers";
import { s } from "../../styles";
import { WizardDialog } from "../WizardDialog";
import { TargetStep } from "../TargetStep";
import { PreviewStep } from "../PreviewStep";
import { ConfigureStep } from "../ConfigureStep";
import { InstallStep } from "../InstallStep";

const TITLE_ID = "ci-wizard-title";

/** A step-1 rejection, remembered with the repo it was for so Continue stays disabled for it. */
interface TargetError {
  repo: string;
  key: string;
  agentName?: string;
}

export function ExportWizard({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const t = useTranslations("ci");
  const repos = useRepos();
  const filesExport = useExportCi(agent.id);
  const prExport = useExportCi(agent.id);

  const [step, setStep] = React.useState(0);
  const [repo, setRepo] = React.useState("");
  const [triggers, setTriggers] = React.useState<string[]>(CI_TRIGGERS.map((x) => x.value));
  const [postAs, setPostAs] = React.useState<CiPostAs>("github_review");
  const [files, setFiles] = React.useState<CiFile[]>([]);
  const [targetError, setTargetError] = React.useState<TargetError | null>(null);
  const [prUrl, setPrUrl] = React.useState<string | null>(null);
  const [generateErrorKey, setGenerateErrorKey] = React.useState<string | null>(null);

  // A finished or failed install no longer applies once its inputs change.
  const resetInstall = () => {
    setPrUrl(null);
    prExport.reset();
  };
  const changeRepo = (v: string) => {
    setRepo(v);
    setGenerateErrorKey(null);
    resetInstall();
  };
  const changePostAs = (v: CiPostAs) => {
    setPostAs(v);
    resetInstall();
  };

  const providerUnsupported = agent.provider !== "openrouter";
  const repoNames = (repos.data ?? []).map((r) => r.full_name);

  // Derived, not stored: which message step 1 shows right now.
  const shownError =
    providerUnsupported
      ? { key: "wizard.target.providerUnsupported" }
      : targetError && targetError.repo === repo
        ? targetError
        : null;
  const blocked = providerUnsupported || targetError?.repo === repo;

  const toggleTrigger = (v: string) => {
    setTriggers((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
    resetInstall();
  };

  const generate = () => {
    if (filesExport.isPending) return;
    setGenerateErrorKey(null);
    filesExport.mutate(
      { repo, target: "gha", action: "files", post_as: postAs, triggers },
      {
        onSuccess: (data) => {
          setTargetError(null);
          setFiles(data.files);
          setStep(1);
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "ci_repo_has_other_agent") {
            const d = err.details as { agent_name?: string } | undefined;
            setTargetError({ repo, key: "wizard.target.repoTaken", agentName: d?.agent_name ?? err.message });
          } else if (err instanceof ApiError && err.code === "ci_provider_unsupported") {
            setTargetError({ repo, key: "wizard.target.providerUnsupported" });
          } else {
            setGenerateErrorKey(exportErrorKey(err));
          }
        },
      },
    );
  };

  const install = () => {
    if (prExport.isPending) return;
    prExport.mutate(
      { repo, target: "gha", action: "open_pr", post_as: postAs, triggers },
      { onSuccess: (data) => setPrUrl(data.pr_url) },
    );
  };

  const stepLabels = WIZARD_STEPS.map((k) => t(k));
  const noTrigger = triggers.length === 0;

  let body: React.ReactNode;
  let footer: React.ReactNode;
  if (step === 0) {
    body = (
      <TargetStep
        repos={repoNames}
        repo={repo}
        onRepo={changeRepo}
        target="gha"
        errorKey={shownError?.key ?? generateErrorKey}
        errorValues={targetError && "agentName" in targetError ? { agent: targetError.agentName ?? "" } : undefined}
      />
    );
    footer = (
      <Button
        kind="primary"
        onClick={generate}
        disabled={!repo || blocked || filesExport.isPending}
        loading={filesExport.isPending}
        data-ci-continue
      >
        {t("wizard.continue")}
      </Button>
    );
  } else if (step === 1) {
    body = <PreviewStep files={files} />;
    footer = (
      <>
        <Button kind="ghost" onClick={() => setStep(0)}>{t("wizard.back")}</Button>
        <Button kind="primary" onClick={() => setStep(2)} data-ci-continue>{t("wizard.continue")}</Button>
      </>
    );
  } else if (step === 2) {
    body = (
      <ConfigureStep triggers={triggers} onToggleTrigger={toggleTrigger} postAs={postAs} onPostAs={changePostAs} />
    );
    footer = (
      <>
        <Button kind="ghost" onClick={() => setStep(1)}>{t("wizard.back")}</Button>
        <Button kind="primary" onClick={() => setStep(3)} disabled={noTrigger} data-ci-continue>
          {t("wizard.continue")}
        </Button>
      </>
    );
  } else {
    body = (
      <InstallStep
        repo={repo}
        prUrl={prUrl}
        errorKey={prExport.isError ? exportErrorKey(prExport.error) : null}
      />
    );
    footer = (
      <>
        <Button kind="ghost" onClick={() => setStep(2)} disabled={prExport.isPending}>
          {t("wizard.back")}
        </Button>
        <Button
          kind="primary"
          onClick={install}
          disabled={prExport.isPending || prUrl !== null}
          aria-busy={prExport.isPending}
          data-ci-install
        >
          {prExport.isPending ? t("wizard.installing") : t("wizard.install")}
        </Button>
      </>
    );
  }

  return (
    <WizardDialog step={step} titleId={TITLE_ID} title={t("wizard.title")} onClose={onClose} footer={footer}>
      <ExportWizardSteps step={step} labels={stepLabels} />
      <span style={s.srOnly} aria-current="step">
        {t("wizard.currentStep", { step: stepLabels[step] ?? "" })}
      </span>
      {body}
    </WizardDialog>
  );
}
