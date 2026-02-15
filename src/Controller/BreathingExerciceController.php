<?php

namespace App\Controller;

use App\Entity\BreathingExercice;
use App\Form\BreathingExerciceType;
use App\Repository\BreathingExerciceRepository;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/breathing/exercice')]
final class BreathingExerciceController extends AbstractController
{
    #[Route(name: 'app_breathing_exercice_index', methods: ['GET'])]
    public function index(BreathingExerciceRepository $breathingExerciceRepository): Response
    {
        return $this->render('breathing_exercice/index.html.twig', [
            'breathing_exercices' => $breathingExerciceRepository->findAll(),
        ]);
    }

    #[Route('/new', name: 'app_breathing_exercice_new', methods: ['GET', 'POST'])]
    public function new(Request $request, EntityManagerInterface $entityManager): Response
    {
        $breathingExercice = new BreathingExercice();
        $form = $this->createForm(BreathingExerciceType::class, $breathingExercice);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $entityManager->persist($breathingExercice);
            $entityManager->flush();

            return $this->redirectToRoute('app_breathing_exercice_index', [], Response::HTTP_SEE_OTHER);
        }

        return $this->render('breathing_exercice/new.html.twig', [
            'breathing_exercice' => $breathingExercice,
            'form' => $form,
        ]);
    }

    #[Route('/{id}', name: 'app_breathing_exercice_show', methods: ['GET'])]
    public function show(BreathingExercice $breathingExercice): Response
    {
        return $this->render('breathing_exercice/show.html.twig', [
            'breathing_exercice' => $breathingExercice,
        ]);
    }

    #[Route('/{id}/edit', name: 'app_breathing_exercice_edit', methods: ['GET', 'POST'])]
    public function edit(Request $request, BreathingExercice $breathingExercice, EntityManagerInterface $entityManager): Response
    {
        $form = $this->createForm(BreathingExerciceType::class, $breathingExercice);
        $form->handleRequest($request);

        if ($form->isSubmitted() && $form->isValid()) {
            $entityManager->flush();

            return $this->redirectToRoute('app_breathing_exercice_index', [], Response::HTTP_SEE_OTHER);
        }

        return $this->render('breathing_exercice/edit.html.twig', [
            'breathing_exercice' => $breathingExercice,
            'form' => $form,
        ]);
    }

    #[Route('/{id}', name: 'app_breathing_exercice_delete', methods: ['POST'])]
    public function delete(Request $request, BreathingExercice $breathingExercice, EntityManagerInterface $entityManager): Response
    {
        if ($this->isCsrfTokenValid('delete'.$breathingExercice->getId(), $request->getPayload()->getString('_token'))) {
            $entityManager->remove($breathingExercice);
            $entityManager->flush();
        }

        return $this->redirectToRoute('app_breathing_exercice_index', [], Response::HTTP_SEE_OTHER);
    }
}
